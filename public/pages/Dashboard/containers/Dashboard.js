/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from 'react';
import _ from 'lodash';
import queryString from 'query-string';
import { EuiBasicTable, EuiButton, EuiHorizontalRule, EuiIcon } from '@elastic/eui';
import ContentPanel from '../../../components/ContentPanel';
import DashboardEmptyPrompt from '../components/DashboardEmptyPrompt';
import DashboardControls from '../components/DashboardControls';
import { alertColumns, queryColumns } from '../utils/tableUtils';
import {
  ALERT_STATE,
  MONITOR_TYPE,
  OPENSEARCH_DASHBOARDS_AD_PLUGIN,
} from '../../../utils/constants';
import { backendErrorNotification } from '../../../utils/helpers';
import {
  getInitialSize,
  getQueryObjectFromState,
  getURLQueryParams,
  groupAlertsByTrigger,
  insertGroupByColumn,
} from '../utils/helpers';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '../../Monitors/containers/Monitors/utils/constants';
import { MAX_ALERT_COUNT } from '../utils/constants';
import AcknowledgeAlertsModal from '../components/AcknowledgeAlertsModal';

export default class Dashboard extends Component {
  constructor(props) {
    super(props);

    const { location, perAlertView } = props;

    const {
      alertState,
      from,
      search,
      severityLevel,
      size,
      sortDirection,
      sortField,
    } = getURLQueryParams(location);

    this.state = {
      alerts: [],
      alertsByTriggers: [],
      alertState,
      flyoutIsOpen: false,
      loadingMonitors: true,
      monitors: [],
      monitorIds: this.props.monitorIds,
      page: Math.floor(from / size),
      search,
      selectedItems: [],
      severityLevel,
      showAlertsModal: false,
      size: getInitialSize(perAlertView, size),
      sortDirection,
      sortField,
      totalAlerts: 0,
      totalTriggers: 0,
    };
  }

  static defaultProps = {
    monitorIds: [],
    detectorIds: [],
  };

  componentDidMount() {
    const {
      alertState,
      page,
      search,
      severityLevel,
      size,
      sortDirection,
      sortField,
      monitorIds,
    } = this.state;
    this.getAlerts(
      page * size,
      size,
      search,
      sortField,
      sortDirection,
      severityLevel,
      alertState,
      monitorIds
    );
  }

  componentDidUpdate(prevProps, prevState) {
    const prevQuery = getQueryObjectFromState(prevState);
    const currQuery = getQueryObjectFromState(this.state);
    if (!_.isEqual(prevQuery, currQuery)) {
      const {
        page,
        size,
        search,
        sortField,
        sortDirection,
        severityLevel,
        alertState,
        monitorIds,
      } = this.state;
      this.getAlerts(
        page * size,
        size,
        search,
        sortField,
        sortDirection,
        severityLevel,
        alertState,
        monitorIds
      );
    }
  }

  getAlerts = _.debounce(
    (from, size, search, sortField, sortDirection, severityLevel, alertState, monitorIds) => {
      const params = {
        from,
        size,
        search,
        sortField,
        sortDirection,
        severityLevel,
        alertState,
        monitorIds,
      };
      const queryParamsString = queryString.stringify(params);
      location.search;
      const { httpClient, history, notifications, perAlertView } = this.props;
      history.replace({ ...this.props.location, search: queryParamsString });
      httpClient.get('../api/alerting/alerts', { query: params }).then((resp) => {
        if (resp.ok) {
          const { alerts, totalAlerts } = resp;
          this.setState({ alerts, totalAlerts });

          if (!perAlertView) {
            const alertsByTriggers = groupAlertsByTrigger(alerts);
            this.setState({
              totalTriggers: alertsByTriggers.length,
              alertsByTriggers,
            });
            this.getMonitors();
          }
        } else {
          console.log('error getting alerts:', resp);
          backendErrorNotification(notifications, 'get', 'alerts', resp.err);
        }
      });
    },
    500,
    { leading: true }
  );

  async getMonitors() {
    const { httpClient } = this.props;
    const { alertsByTriggers } = this.state;
    this.setState({ ...this.state, loadingMonitors: true });
    const monitorIds = alertsByTriggers.map((alert) => alert.monitor_id);
    let monitors;
    try {
      const params = {
        query: {
          query: {
            ids: {
              values: monitorIds,
            },
          },
        },
      };
      const response = await httpClient.post('../api/alerting/monitors/_search', {
        body: JSON.stringify(params),
      });
      if (response.ok) {
        monitors = _.get(response, 'resp.hits.hits', []);
      } else {
        console.log('error getting monitors:', response);
      }
    } catch (err) {
      console.error(err);
    }
    this.setState({ ...this.state, loadingMonitors: false, monitors: monitors });
  }

  onTableChange = ({ page: tablePage = {}, sort = {} }) => {
    const { index: page, size } = tablePage;
    const { field: sortField, direction: sortDirection } = sort;
    this.setState({ page, size, sortField, sortDirection });
  };

  onSeverityLevelChange = (e) => {
    this.setState({ page: 0, severityLevel: e.target.value });
  };

  onAlertStateChange = (e) => {
    this.setState({ page: 0, alertState: e.target.value });
  };

  onSelectionChange = (selectedItems) => {
    this.setState({ selectedItems });
  };

  onSearchChange = (e) => {
    this.setState({ page: 0, search: e.target.value });
  };

  onPageClick = (page) => {
    this.setState({ page });
  };

  openFlyout = (payload) => {
    this.setState({ ...this.state, flyoutIsOpen: true });
    this.props.setFlyout({
      type: 'alertsDashboard',
      payload: { ...payload },
    });
  };

  closeFlyout = () => {
    this.props.setFlyout(null);
    this.setState({ ...this.state, flyoutIsOpen: false });
  };

  refreshDashboard = () => {
    const {
      page,
      size,
      search,
      sortField,
      sortDirection,
      severityLevel,
      alertState,
      monitorIds,
    } = this.state;
    this.getAlerts(
      page * size,
      size,
      search,
      sortField,
      sortDirection,
      severityLevel,
      alertState,
      monitorIds
    );
  };

  openModal = () => {
    this.setState({ ...this.state, showAlertsModal: true });
  };

  closeModal = () => {
    this.setState({ ...this.state, search: '', showAlertsModal: false });
    this.refreshDashboard();
  };

  renderModal = () => {
    const { history, httpClient, location, notifications } = this.props;
    const { monitors, selectedItems } = this.state;
    const { monitor_id, triggerID, trigger_name } = selectedItems[0];
    const monitor = _.get(_.find(monitors, { _id: monitor_id }), '_source');
    return (
      <AcknowledgeAlertsModal
        history={history}
        httpClient={httpClient}
        location={location}
        monitor={monitor}
        monitorId={monitor_id}
        notifications={notifications}
        onClose={this.closeModal}
        triggerId={triggerID}
        triggerName={trigger_name}
      />
    );
  };

  render() {
    const {
      alerts,
      alertsByTriggers,
      alertState,
      loadingMonitors,
      monitors,
      page,
      search,
      selectedItems,
      severityLevel,
      size,
      sortDirection,
      sortField,
      totalAlerts,
      totalTriggers,
    } = this.state;
    const {
      monitorIds,
      detectorIds,
      onCreateTrigger,
      perAlertView,
      monitorType,
      groupBy,
      setFlyout,
      httpClient,
      location,
      history,
      notifications,
      isAlertsFlyout = false,
    } = this.props;
    let totalItems = perAlertView ? totalAlerts : totalTriggers;
    const isBucketMonitor = monitorType === MONITOR_TYPE.BUCKET_LEVEL;

    let columnType = perAlertView
      ? isBucketMonitor
        ? insertGroupByColumn(groupBy)
        : queryColumns
      : alertColumns(
          history,
          httpClient,
          loadingMonitors,
          location,
          monitors,
          notifications,
          setFlyout,
          this.openFlyout,
          this.closeFlyout,
          this.refreshDashboard
        );

    const pagination = {
      pageIndex: page,
      pageSize: size,
      totalItemCount: Math.min(MAX_ALERT_COUNT, totalItems),
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
    };

    const sorting = {
      sort: {
        direction: sortDirection,
        field: sortField,
      },
    };

    const selection = {
      onSelectionChange: this.onSelectionChange,
      selectable: perAlertView
        ? (item) => item.state === ALERT_STATE.ACTIVE
        : (item) => item.ACTIVE > 0,
      selectableMessage: perAlertView
        ? (selectable) => (selectable ? undefined : 'Only active alerts can be acknowledged.')
        : (selectable) =>
            selectable ? undefined : 'Only triggers with active alerts can be acknowledged.',
    };

    const actions = () => {
      // The acknowledge button is disabled when viewing by per alerts, and no item selected or per trigger view and item selected is not 1.
      const actions = [
        <EuiButton
          onClick={this.openModal}
          disabled={perAlertView ? !selectedItems.length : selectedItems.length !== 1}
          data-test-subj={'acknowledgeAlertsButton'}
        >
          Acknowledge
        </EuiButton>,
      ];

      if (!perAlertView) {
        const alert = selectedItems[0];
        actions.unshift(
          <EuiButton
            onClick={() => {
              this.openFlyout({
                ...alert,
                history,
                httpClient,
                loadingMonitors,
                location,
                monitors,
                notifications,
                setFlyout,
                closeFlyout: this.closeFlyout,
                refreshDashboard: this.refreshDashboard,
              });
            }}
            disabled={selectedItems.length !== 1}
          >
            View alert details
          </EuiButton>
        );
      }

      if (detectorIds.length) {
        actions.unshift(
          <EuiButton
            href={`${OPENSEARCH_DASHBOARDS_AD_PLUGIN}#/detectors/${detectorIds[0]}`}
            target="_blank"
          >
            View detector <EuiIcon type="popout" />
          </EuiButton>
        );
      }
      return actions;
    };

    const getItemId = (item) => {
      if (perAlertView) return isBucketMonitor ? item.id : `${item.id}-${item.version}`;
      return `${item.triggerID}-${item.version}`;
    };

    return (
      <ContentPanel
        title={perAlertView ? 'Alerts' : 'Alerts by triggers'}
        titleSize={monitorIds.length ? 's' : 'l'}
        bodyStyles={{ padding: 'initial' }}
        actions={actions()}
      >
        <DashboardControls
          activePage={page}
          pageCount={Math.ceil(totalItems / size) || 1}
          search={search}
          severity={severityLevel}
          state={alertState}
          onSearchChange={this.onSearchChange}
          onSeverityChange={this.onSeverityLevelChange}
          onStateChange={this.onAlertStateChange}
          onPageChange={this.onPageClick}
          isAlertsFlyout={isAlertsFlyout}
        />

        <EuiHorizontalRule margin="xs" />

        <EuiBasicTable
          items={perAlertView ? alerts : alertsByTriggers}
          /*
           * If using just ID, doesn't update selectedItems when doing acknowledge
           * because the next getAlerts have the same id
           * $id-$version will correctly remove selected items
           * */
          itemId={getItemId}
          columns={columnType}
          pagination={perAlertView ? pagination : undefined}
          sorting={sorting}
          isSelectable={true}
          selection={selection}
          onChange={this.onTableChange}
          noItemsMessage={<DashboardEmptyPrompt onCreateTrigger={onCreateTrigger} />}
          data-test-subj={'alertsDashboard_table'}
        />

        {this.state.showAlertsModal && this.renderModal()}
      </ContentPanel>
    );
  }
}
