import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SidebarAppSDK } from '@contentful/app-sdk';
import { useSDK } from '@contentful/react-apps-toolkit';
import { createClient } from 'contentful-management';
import {
  Box,
  Switch,
  Select,
  Note,
  Paragraph,
  Spinner,
  Badge,
  Stack,
  Subheading,
} from '@contentful/f36-components';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WorkflowDefinitionItem {
  sys: { id: string };
  name: string;
  steps: Array<{ id: string; name: string }>;
}

interface WorkflowItem {
  sys: { id: string; version: number };
  stepId?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CONFIG_CONTENT_TYPE_ID = 'workflowSidebarConfig';

/* ------------------------------------------------------------------ */
/*  Sidebar Component                                                  */
/* ------------------------------------------------------------------ */

const Sidebar = () => {
  const sdk = useSDK<SidebarAppSDK>();

  // CMA client scoped to the current space / environment
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

  /* ---------- state ---------- */
  const [loading, setLoading] = useState(true);

  // Active workflow on this entry (null = none)
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowItem | null>(null);

  // Available workflow definitions in the space
  const [workflowDefs, setWorkflowDefs] = useState<WorkflowDefinitionItem[]>([]);

  // Toggle: complete workflow after publish
  const [completeOnPublish, setCompleteOnPublish] = useState(false);

  // Toggle: start workflow on edit after publish
  const [startOnEdit, setStartOnEdit] = useState(false);
  const [selectedDefId, setSelectedDefId] = useState<string>('');

  // Track published version so we can detect publish & edit events
  const [lastPublishedVersion, setLastPublishedVersion] = useState<number | undefined>(
    sdk.entry.getSys().publishedVersion
  );

  // Guard against re-entrant workflow completion (the re-publish triggers another onSysChanged)
  const completingRef = useRef(false);

  // Tracks the config entry ID so we can update rather than re-create
  const configEntryIdRef = useRef<string | null>(null);
  // Debounce timer for saving config
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- helpers ---------- */

  const entryId = sdk.entry.getSys().id;
  const defaultLocale = sdk.locales.default;

  const fetchActiveWorkflow = useCallback(async () => {
    try {
      const res = await cma.workflow.getMany({});
      // Filter client-side for workflows on this entry
      const active =
        res.items?.find(
          (w: any) => w.sys?.entity?.sys?.id === entryId
        ) ?? null;
      setActiveWorkflow(active as unknown as WorkflowItem | null);
    } catch {
      // Workflows API may 404 if no workflows exist — that's fine
      setActiveWorkflow(null);
    }
  }, [cma, entryId]);

  const fetchWorkflowDefs = useCallback(async () => {
    try {
      const res = await cma.workflowDefinition.getMany({});
      setWorkflowDefs((res.items ?? []) as unknown as WorkflowDefinitionItem[]);
    } catch {
      setWorkflowDefs([]);
    }
  }, [cma]);

  /** Create the config content type if it doesn't already exist. */
  const ensureConfigContentType = useCallback(async () => {
    try {
      await cma.contentType.get({ contentTypeId: CONFIG_CONTENT_TYPE_ID });
    } catch {
      const created = await cma.contentType.createWithId(
        { contentTypeId: CONFIG_CONTENT_TYPE_ID },
        {
          name: 'Workflow Sidebar Config',
          description:
            'Per-entry settings for the Workflow Sidebar App. Managed automatically — do not edit manually.',
          displayField: 'targetEntryId',
          fields: [
            { id: 'targetEntryId', name: 'Target Entry ID', type: 'Symbol', required: true, localized: false, validations: [{ unique: true }] },
            { id: 'completeOnPublish', name: 'Complete on Publish', type: 'Boolean', required: false, localized: false },
            { id: 'startOnEdit', name: 'Start on Edit', type: 'Boolean', required: false, localized: false },
            { id: 'selectedWorkflowDefinitionId', name: 'Selected Workflow Definition ID', type: 'Symbol', required: false, localized: false },
          ],
        }
      );
      await cma.contentType.publish({ contentTypeId: CONFIG_CONTENT_TYPE_ID }, created);
    }
  }, [cma]);

  /** Load persisted config for this entry from the config content type. */
  const loadConfig = useCallback(async () => {
    try {
      const res = await cma.entry.getMany({
        query: {
          content_type: CONFIG_CONTENT_TYPE_ID,
          'fields.targetEntryId': entryId,
          limit: 1,
        },
      });
      const item = res.items?.[0];
      if (item) {
        configEntryIdRef.current = item.sys.id;
        const f = item.fields as any;
        setCompleteOnPublish(f.completeOnPublish?.[defaultLocale] ?? false);
        setStartOnEdit(f.startOnEdit?.[defaultLocale] ?? false);
        setSelectedDefId(f.selectedWorkflowDefinitionId?.[defaultLocale] ?? '');
      }
    } catch {
      // Config content type may not exist yet — ignore
    }
  }, [cma, entryId, defaultLocale]);

  /** Persist the current toggle state to the config content type. */
  const saveConfig = useCallback(
    async (values: {
      completeOnPublish: boolean;
      startOnEdit: boolean;
      selectedDefId: string;
    }) => {
      const fields: Record<string, Record<string, any>> = {
        targetEntryId: { [defaultLocale]: entryId },
        completeOnPublish: { [defaultLocale]: values.completeOnPublish },
        startOnEdit: { [defaultLocale]: values.startOnEdit },
        selectedWorkflowDefinitionId: { [defaultLocale]: values.selectedDefId },
      };

      try {
        if (configEntryIdRef.current) {
          // Update existing config entry
          const existing = await cma.entry.get({ entryId: configEntryIdRef.current });
          existing.fields = fields;
          await cma.entry.update({ entryId: configEntryIdRef.current }, existing);
        } else {
          // Create new config entry
          const created = await cma.entry.create(
            { contentTypeId: CONFIG_CONTENT_TYPE_ID },
            { fields }
          );
          configEntryIdRef.current = created.sys.id;
        }
      } catch (err) {
        // Silently fail — settings won't persist but the sidebar still works
        console.warn('Failed to save workflow sidebar config:', err);
      }
    },
    [cma, entryId, defaultLocale]
  );

  /** Debounced save — waits 500ms after last change before writing. */
  const debouncedSave = useCallback(
    (values: Parameters<typeof saveConfig>[0]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveConfig(values), 500);
    },
    [saveConfig]
  );

  /* ---------- initial load ---------- */

  useEffect(() => {
    (async () => {
      await ensureConfigContentType();
      await Promise.all([fetchActiveWorkflow(), fetchWorkflowDefs(), loadConfig()]);
      setLoading(false);
    })();
  }, [ensureConfigContentType, fetchActiveWorkflow, fetchWorkflowDefs, loadConfig]);

  /* ---------- listen for sys changes (publish / edit detection) ---------- */

  useEffect(() => {
    const detach = sdk.entry.onSysChanged(async (sys) => {
      const newPublishedVersion = sys.publishedVersion;

      // --- Detect PUBLISH event (publishedVersion just increased) ---
      if (
        completeOnPublish &&
        activeWorkflow &&
        !completingRef.current &&
        newPublishedVersion !== undefined &&
        newPublishedVersion !== lastPublishedVersion
      ) {
        completingRef.current = true;
        try {
          await cma.workflow.complete({
            workflowId: activeWorkflow.sys.id,
            version: activeWorkflow.sys.version,
          });

          // Re-publish the entry so the version stays in sync
          // (workflow completion bumps sys.version without publishing)
          const freshEntry = await cma.entry.get({ entryId });
          await cma.entry.publish({ entryId }, freshEntry);

          sdk.notifier.success('Workflow completed automatically after publishing.');
          setActiveWorkflow(null);
          setCompleteOnPublish(false);
          saveConfig({ completeOnPublish: false, startOnEdit, selectedDefId });
          await fetchActiveWorkflow();
        } catch (err: any) {
          sdk.notifier.error(
            `Could not complete workflow: ${err?.message ?? 'Unknown error'}`
          );
        } finally {
          completingRef.current = false;
        }
      }

      // --- Detect EDIT after publish (version changed while already published) ---
      if (
        startOnEdit &&
        selectedDefId &&
        !activeWorkflow &&
        newPublishedVersion !== undefined &&
        sys.version !== undefined &&
        sys.version > (newPublishedVersion + 1)
      ) {
        try {
          const selectedDef = workflowDefs.find((d) => d.sys.id === selectedDefId);
          const firstStepId = selectedDef?.steps?.[0]?.id;
          if (!firstStepId) {
            sdk.notifier.error('Selected workflow definition has no valid steps.');
            return;
          }

          const created = await cma.workflow.create(
            {},
            {
              entity: {
                sys: { type: 'Link', linkType: 'Entry', id: entryId },
              },
              workflowDefinition: {
                sys: { type: 'Link', linkType: 'WorkflowDefinition', id: selectedDefId },
              },
              stepId: firstStepId,
            }
          );
          sdk.notifier.success('Workflow started automatically after edit.');
          setActiveWorkflow(created as unknown as WorkflowItem);
          setStartOnEdit(false);
          saveConfig({ completeOnPublish, startOnEdit: false, selectedDefId });
        } catch (err: any) {
          sdk.notifier.error(
            `Could not start workflow: ${err?.message ?? 'Unknown error'}`
          );
        }
      }

      setLastPublishedVersion(newPublishedVersion);
    });

    return () => detach();
  }, [
    sdk,
    cma,
    entryId,
    completeOnPublish,
    startOnEdit,
    selectedDefId,
    activeWorkflow,
    lastPublishedVersion,
    workflowDefs,
    fetchActiveWorkflow,
    saveConfig,
  ]);

  /* ---------- auto-resize the sidebar iframe ---------- */
  useEffect(() => {
    sdk.window.startAutoResizer();
    return () => sdk.window.stopAutoResizer();
  }, [sdk]);

  /* ---------- render ---------- */

  if (loading) {
    return (
      <Box padding="spacingM">
        <Stack flexDirection="row" alignItems="center" spacing="spacingS">
          <Spinner size="small" />
          <Paragraph>Loading workflow info…</Paragraph>
        </Stack>
      </Box>
    );
  }

  return (
    <Box padding="spacingM">
      {/* -------- Section 1: Complete workflow on publish -------- */}
      <Box marginBottom="spacingL">
        <Subheading marginBottom="spacingXs">After Publishing</Subheading>

        {activeWorkflow ? (
          <>
            <Box marginBottom="spacingS">
              <Stack flexDirection="row" alignItems="center" spacing="spacingXs">
                <Badge variant="primary">In Workflow</Badge>
              </Stack>
            </Box>
            <Switch
              id="complete-on-publish"
              isChecked={completeOnPublish}
              onChange={() =>
                setCompleteOnPublish((v) => {
                  const next = !v;
                  debouncedSave({ completeOnPublish: next, startOnEdit, selectedDefId });
                  return next;
                })
              }
            >
              Complete the workflow after publishing
            </Switch>
            {completeOnPublish && (
              <Note variant="primary" style={{ marginTop: 8 }}>
                The active workflow will be completed the next time you publish this entry.
              </Note>
            )}
          </>
        ) : (
          <Note variant="neutral">
            No active workflow on this entry. This option is available when the entry is
            part of a workflow.
          </Note>
        )}
      </Box>

      {/* -------- Section 2: Start workflow on edit after publish -------- */}
      <Box>
        <Subheading marginBottom="spacingXs">After Editing Published Content</Subheading>

        <Switch
          id="start-on-edit"
          isChecked={startOnEdit}
          onChange={() =>
            setStartOnEdit((v) => {
              const next = !v;
              debouncedSave({ completeOnPublish, startOnEdit: next, selectedDefId });
              return next;
            })
          }
        >
          Start a workflow when this content is edited after publishing
        </Switch>

        {startOnEdit && (
          <Box marginTop="spacingS">
            {workflowDefs.length > 0 ? (
              <Select
                id="workflow-def-select"
                value={selectedDefId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const next = e.target.value;
                  setSelectedDefId(next);
                  debouncedSave({ completeOnPublish, startOnEdit, selectedDefId: next });
                }}
              >
                <Select.Option value="" isDisabled>
                  Select a workflow…
                </Select.Option>
                {workflowDefs.map((def) => (
                  <Select.Option key={def.sys.id} value={def.sys.id}>
                    {def.name}
                  </Select.Option>
                ))}
              </Select>
            ) : (
              <Note variant="warning" style={{ marginTop: 4 }}>
                No workflow definitions found in this environment. Create a workflow first
                under AI &amp; Automations → Workflows.
              </Note>
            )}

            {selectedDefId && (
              <Note variant="primary" style={{ marginTop: 8 }}>
                The selected workflow will start automatically the next time this published
                entry is edited.
              </Note>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Sidebar;
