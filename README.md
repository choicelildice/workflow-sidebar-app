# Workflow Sidebar App

A [Contentful App Framework](https://www.contentful.com/developers/docs/extensibility/app-framework/) sidebar app that adds workflow automation controls directly to the entry editor. Editors can configure per-entry automation without leaving the editor UI.

## Features

- **Complete on Publish** — When an entry is in an active workflow, toggle this on to automatically complete the workflow the next time the entry is published.
- **Start on Edit** — Toggle this on to automatically start a chosen workflow definition when a published entry is edited again.

Settings are persisted per-entry via a `workflowSidebarConfig` content type that the app creates automatically on first install.

## Requirements

- A Contentful space with the **Workflows** feature enabled (available on certain plans)
- At least one Workflow Definition configured under **AI & Automations → Workflows**

## Installation

1. Clone this repo and install dependencies:
   ```bash
   npm install
   ```

2. Create an app definition in your Contentful organization:
   ```bash
   npm run create-app-definition
   ```

3. Build and upload the bundle:
   ```bash
   npm run build
   npm run upload
   ```

4. In the Contentful web app, install the app into your space and environment via **Apps → Manage apps**.

5. Assign the app to the sidebar of any content type under **Content model → [Content Type] → Sidebar**.

## Local development

```bash
npm start
```

The dev server runs on `http://localhost:3000`. Use the Contentful App Framework's local development proxy to load it inside the web app.

## How it works

The sidebar renders two automation controls for each entry:

- **After Publishing** — shown only when the entry has an active workflow. Completing the workflow also re-publishes the entry to keep versions in sync.
- **After Editing Published Content** — always shown. When enabled, prompts you to select a workflow definition; the selected workflow starts automatically the next time the entry is edited after being published.

Per-entry settings are stored in a `workflowSidebarConfig` content type (created on first app install/configuration). Each entry gets one config entry keyed by its ID. You can restrict who can modify these settings via Contentful roles and permissions on the `Workflow Sidebar Config` content type.

---

## ⚠️ Important disclaimers

**This is demo / sample code.**

- It is **not covered by the Contentful SLA** and is provided as-is, without any warranty or official support.
- It has not undergone production-grade testing or security review.
- **Test thoroughly in a non-production environment before deploying to any production Contentful space.** Workflow and publish operations made by this app are real API calls that affect live content.
- Use at your own risk. Contentful is not responsible for any data loss, unintended publishes, or workflow state changes caused by this app.
