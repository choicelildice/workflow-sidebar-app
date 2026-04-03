import React, { useCallback, useEffect, useMemo } from 'react';
import { useSDK } from '@contentful/react-apps-toolkit';
import { ConfigAppSDK } from '@contentful/app-sdk';
import { createClient } from 'contentful-management';
import {
  Heading,
  Subheading,
  Paragraph,
  Box,
  Note,
  List,
  ListItem,
} from '@contentful/f36-components';

const CONFIG_CONTENT_TYPE_ID = 'workflowSidebarConfig';

const ConfigScreen = () => {
  const sdk = useSDK<ConfigAppSDK>();

  const cma = useMemo(
    () =>
      createClient(
        { apiAdapter: sdk.cmaAdapter },
        {
          type: 'plain',
          defaults: {
            environmentId: sdk.ids.environmentAlias ?? sdk.ids.environment,
            spaceId: sdk.ids.space,
          },
        }
      ),
    [sdk]
  );

  const ensureConfigContentType = useCallback(async () => {
    try {
      await cma.contentType.get({ contentTypeId: CONFIG_CONTENT_TYPE_ID });
      // Already exists — nothing to do
    } catch {
      // Create the content type
      const created = await cma.contentType.createWithId(
        { contentTypeId: CONFIG_CONTENT_TYPE_ID },
        {
          name: 'Workflow Sidebar Config',
          description:
            'Per-entry settings for the Workflow Sidebar App. Managed automatically — do not edit manually.',
          displayField: 'targetEntryId',
          fields: [
            {
              id: 'targetEntryId',
              name: 'Target Entry ID',
              type: 'Symbol',
              required: true,
              localized: false,
              validations: [{ unique: true }],
            },
            {
              id: 'completeOnPublish',
              name: 'Complete on Publish',
              type: 'Boolean',
              required: false,
              localized: false,
            },
            {
              id: 'startOnEdit',
              name: 'Start on Edit',
              type: 'Boolean',
              required: false,
              localized: false,
            },
            {
              id: 'selectedWorkflowDefinitionId',
              name: 'Selected Workflow Definition ID',
              type: 'Symbol',
              required: false,
              localized: false,
            },
          ],
        }
      );
      await cma.contentType.publish(
        { contentTypeId: CONFIG_CONTENT_TYPE_ID },
        created
      );
    }
  }, [cma]);

  const onConfigure = useCallback(async () => {
    await ensureConfigContentType();
    const currentState = await sdk.app.getCurrentState();
    return {
      parameters: {},
      targetState: currentState,
    };
  }, [sdk, ensureConfigContentType]);

  useEffect(() => {
    sdk.app.onConfigure(onConfigure);
  }, [sdk, onConfigure]);

  useEffect(() => {
    sdk.app.setReady();
  }, [sdk]);

  return (
    <Box padding="spacingXl" style={{ maxWidth: 700, margin: '0 auto' }}>
      <Heading marginBottom="spacingL">Workflow Sidebar App</Heading>

      <Paragraph marginBottom="spacingM">
        This app adds workflow automation controls to the entry sidebar, allowing
        editors to automate common workflow actions directly from the editor.
      </Paragraph>

      <Subheading marginBottom="spacingXs">Features</Subheading>
      <Box marginBottom="spacingL">
        <List>
          <ListItem>
            <strong>Complete on Publish</strong> — Automatically complete the
            active workflow when an entry is published.
          </ListItem>
          <ListItem>
            <strong>Start on Edit</strong> — Automatically start a chosen workflow
            when a published entry is edited.
          </ListItem>
        </List>
      </Box>

      <Subheading marginBottom="spacingXs">Setup</Subheading>
      <Paragraph marginBottom="spacingM">
        After installing, assign this app to the sidebar of any content type
        under <strong>Content model → [Content Type] → Sidebar</strong>.
      </Paragraph>

      <Note variant="warning" title="Content type created on install">
        This app creates a <code>workflowSidebarConfig</code> content type in
        your environment to store per-entry automation settings. This content
        type is managed automatically by the app. You can control who can modify
        these settings by configuring roles and permissions on the{' '}
        <code>Workflow Sidebar Config</code> content type.
      </Note>
    </Box>
  );
};

export default ConfigScreen;
