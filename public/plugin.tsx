/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PLUGIN_NAME } from '../utils/constants';
import { Plugin, CoreSetup, CoreStart } from '../../../src/core/public';
import { ACTION_ALERTING } from './actions/alerting_dashboard_action';
import { CONTEXT_MENU_TRIGGER, EmbeddableStart } from '../../../src/plugins/embeddable/public';
import { getActions, getAdAction } from './utils/contextMenu/actions';
import { alertingTriggerAd } from './utils/contextMenu/triggers';
import { ExpressionsSetup } from '../../../src/plugins/expressions/public';
import { UiActionsSetup } from '../../../src/plugins/ui_actions/public';
import { overlayAlertsFunction } from './expressions/overlay_alerts';
import {
  setClient,
  setEmbeddable,
  setNotifications,
  setOverlays,
  setSavedAugmentVisLoader,
  setUISettings,
  setQueryService,
} from './services';
import { VisAugmenterStart } from '../../../src/plugins/vis_augmenter/public';
import { DataPublicPluginStart } from '../../../src/plugins/data/public';
import { AssistantPublicPluginSetup } from '../../../plugins/dashboards-assistant/public';

declare module '../../../src/plugins/ui_actions/public' {
  export interface ActionContextMapping {
    [ACTION_ALERTING]: {};
  }
}

export let IncontextInsightComponent = (props: any) => <div {...props} />;

export interface AlertingSetup {}

export interface AlertingStart {}

export interface AlertingSetupDeps {
  expressions: ExpressionsSetup;
  uiActions: UiActionsSetup;
  assistantDashboards?: AssistantPublicPluginSetup;
}

export interface AlertingStartDeps {
  visAugmenter: VisAugmenterStart;
  embeddable: EmbeddableStart;
  data: DataPublicPluginStart;
}

export class AlertingPlugin
  implements Plugin<AlertingSetup, AlertingStart, AlertingSetupDeps, AlertingStartDeps> {
  public setup(
    core: CoreSetup<AlertingStartDeps, AlertingStart>,
    { expressions, uiActions, assistantDashboards }: AlertingSetupDeps
  ): AlertingSetup {
    core.application.register({
      id: PLUGIN_NAME,
      title: 'Alerting',
      description: 'OpenSearch Dashboards Alerting Plugin',
      category: {
        id: 'opensearch',
        label: 'OpenSearch Plugins',
        order: 2000,
      },
      order: 4000,
      mount: async (params) => {
        const { renderApp } = await import('./app');
        const [coreStart] = await core.getStartServices();
        return renderApp(coreStart, params);
      },
    });

    if (assistantDashboards) {
      IncontextInsightComponent = (props: any) => (
        <>{assistantDashboards.renderIncontextInsight(props)}</>
      );
      assistantDashboards.registerIncontextInsight([
        {
          key: 'type_query_level_monitor',
          summary:
            'This type of alert monitor that can be used to identify and alert on specific queries that are run against an OpenSearch index; for example, queries that detect and respond to anomalies in specific queries. Per query monitors only trigger one alert at a time.',
          suggestions: ['How to create a per query monitor?'],
        },
        {
          key: 'type_bucket_level_monitor',
          summary:
            'Per bucket monitors are a type of alert monitor that can be used to identify and alert on specific buckets of data that are created by a query against an OpenSearch index.',
          suggestions: ['How to create a per bucket monitor?'],
        },
        {
          key: 'type_cluster_metrics_monitor',
          summary:
            'Per cluster metrics monitors are a type of alert monitor that collects and analyzes metrics from a single cluster, providing insights into the performance and health of the cluster.',
          suggestions: ['How to create a per cluster metrics monitor?'],
        },
        {
          key: 'type_doc_level_monitor',
          summary:
            'Per document monitors are a type of alert monitor that can be used to identify and alert on specific documents in an OpenSearch index.',
          suggestions: ['How to create a per document monitor?'],
        },
        {
          key: 'type_composite',
          summary:
            'A composite monitor is a type of monitor that supports the execution of multiple monitors in a sequential workflow. It supports configuring triggers to create chained alerts.',
          suggestions: ['How to create a composite monitor?', 'How to create a composite monitor?'],
        },
        {
          key: 'content_panel_Data source',
          summary:
            'OpenSearch data sources are the applications that OpenSearch can connect to and ingest data from.',
          suggestions: ['What are the indices in my cluster?'],
        },
        {
          key: 'content_panel_Alerts by triggers',
          summary:
            'Event associated with a trigger. When an alert is created, the trigger performs actions, including sending notifications.',
          suggestions: [
            'Have any alerts triggered today?',
            'How many alerts have a severity level of 2?',
            'How many alerts are currently unresolved?',
          ],
        },
      ]);
    }

    setUISettings(core.uiSettings);

    // Set the HTTP client so it can be pulled into expression fns to make
    // direct server-side calls
    setClient(core.http);

    // registers the expression function used to render anomalies on an Augmented Visualization
    expressions.registerFunction(overlayAlertsFunction());

    // Create context menu actions. Pass core, to access service for flyouts.
    const actions = getActions();

    // Add actions to uiActions
    actions.forEach((action) => {
      uiActions.addTriggerAction(CONTEXT_MENU_TRIGGER, action);
    });

    // Create trigger for other plugins to open flyout. Can be used by other plugins like this:
    const adAction = getAdAction();
    uiActions.registerTrigger(alertingTriggerAd);
    uiActions.addTriggerAction(alertingTriggerAd.id, adAction);

    return;
  }

  public start(
    core: CoreStart,
    { visAugmenter, embeddable, data }: AlertingStartDeps
  ): AlertingStart {
    setEmbeddable(embeddable);
    setOverlays(core.overlays);
    setQueryService(data.query);
    setSavedAugmentVisLoader(visAugmenter.savedAugmentVisLoader);
    setNotifications(core.notifications);
    return {};
  }

  public stop() {}
}
