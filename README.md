# Real-Time Collaborative Editing and Collaborator Indicator Customization in React DOCX Editor

This repository contains an example of how to perform real-time collaborative editing on Word documents using the [Syncfusion® React DOCX Editor](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) (Document Editor). It showcases how multiple users can open the same DOCX file, join a shared collaboration session, and edit the document together in real time directly within the browser.

The core capability is real-time collaborative editing of a DOCX document using **SignalR + Redis**. On top of that core editor experience, the sample provides a **customized title bar** designed specifically for collaboration.

The custom title bar is the main UI enhancement in this sample. It combines:
- A live collaborator avatar stack.
- Role-based avatar indicators.
- Active collaborator count.
- Collaborator role breakdown.
- A share-for-editing dialog.
- Hover profile cards.
- A configurable user-display settings drawer.
- Profile-photo or initials display.


![Collaborator Indicator Customization in Syncfusion React DOCX Editor](/images/collaborator-indicators-in-react-docx-editor.png)

The collaboration state is maintained in **Redis**, while **ASP.NET Core SignalR** distributes user presence and document operations to connected clients.

## Role-Based Avatar Rings

The avatar ring is determined from the user's role.

The sample defines role-specific visual treatment for:

| Role | Purpose |
|---|---|
| `Owner` | Document/session owner |
| `Editor` | User participating as an editor |
| `Reviewer` | Reviewing participant |
| `Commenter` | Commenting participant |
| `Viewer` | Read-only participant |

If a role is unavailable, the title bar falls back to `Viewer`.

This makes collaborator roles visible directly from the compact avatar stack without opening a profile.

---

## Active Collaborator Count

The title bar displays the number of active collaborators:

```text
3 Active Collaborators
```

The count is derived from the current user plus active remote users known to the title bar.

It updates whenever:

- The current user is selected.
- A remote user joins.
- A remote user leaves.
- The collaborator list is refreshed.

The display also handles singular/plural text:

```text
1 Active Collaborator
2 Active Collaborators
```

---

## Role Breakdown

In addition to the total count, the title bar can display a role breakdown such as:

```text
1 Owner | 2 Editors | 1 Reviewer
```

The breakdown is calculated from the active collaborator profiles and only displays roles that are currently represented in the session.

This is useful when the collaboration UI needs to communicate not only **who is online**, but also **what type of participant is online**.

---

## Collaborator Profile Customization

The avatar stack provides two levels of collaborator information.

## Hover Profile

Hovering over an avatar opens a compact profile popup.

The popup can display:

- Profile photo.
- Name.
- Role badge.
- Online status.
- Email.
- Organization.

The popup is intentionally separate from the document editor so it does not interfere with document selection or editing.

The fields are configurable through the title-bar settings drawer.

## Click Profile

Clicking an avatar opens a larger **User profile** dialog.

The profile dialog can show the collaborator's:

- Avatar.
- Name.
- Role.
- Online status.
- Email.
- Organization.

The profile data originates from the server-side user directory and is enriched into collaboration messages by the SignalR hub.

---

## Share for Collaborative Editing

The customized title bar includes a **Share** button.

Selecting it opens:

```text
Share for collaborative editing
```

The dialog:

1. Uses the current browser URL as the session URL.
2. Displays the URL in a read-only input.
3. Allows the user to copy the URL.
4. Allows the URL to be opened in a new browser tab.
5. Explains that another participant will be asked to select a valid user before joining.

Example:

```text
http://localhost:5173/editor?id=<room-id>
```

The `id` query parameter identifies the collaboration room.

## Collaborator Display Settings

The gear button opens the custom **Collaborator Display Settings** drawer.

The settings are held in the `TemplateSettings` object in `title-bar.ts`.

![Collaborator Indicator Settings in Syncfusion React DOCX Editor](/images/collaborator-indicators-display-settings-in-react-docx-editor.png)


## Title Bar Settings

The following options can be enabled/disabled:

- Show total active collaborator count.
- Show role breakdown counts.

## User Icon Settings

The user icon can be configured as:

```text
Profile photo
```

or:

```text
Initials only
```

The hover popup can also be enabled or disabled.

## Hover Popup Fields

Each field can independently be displayed or hidden:

| Setting | Controls |
|---|---|
| Profile photo | Avatar image |
| Name | Collaborator name |
| Role badge | User role |
| Online status | Current collaboration status |
| Email | User email |
| Organization | User organization |

These settings are currently **client-side UI state**. They are not persisted to a database or server.

---

## User Selection and Identity

Before joining a collaboration session, the React application loads the user directory from:

```text
GET /api/Users
```

The user must select a valid profile from the returned list.

This provides the title bar with the complete profile required for:

- Avatar rendering.
- Initials.
- Role.
- Email.
- Organization.
- Online status.

The selected name is also stored in `sessionStorage` through `DataService`.

The client therefore does not allow an arbitrary typed name to join when it does not match a server-provided user profile.

---

## How to run the application

Clone the repository to your local machine.

Configure the required Azure Blob Storage and Redis connection details in the server-side `appsettings.json` file.

```json
{
  "Redis": {
    "ConnectionString": "<your-redis-connection-string>"
  }
}
```
## Start the ASP.NET Core Server

Open a terminal in:

```text
Server-side
```
Run the Server Application. 

```bash
dotnet restore
dotnet build
dotnet run
```

The supplied launch profile uses:

```text
http://localhost:5212
```
## Start the React Client

Install Dependencies. Install the required npm packages for the React client application.

```bash
npm install
```

Run the Application. Start the React development client.

```bash
npm run dev
```

This will start the application in your browser using the local URL shown in the terminal.

Open the application in a browser. This will open the default (Giant Panda.docx) document along with Role-based avatar indicators.

Click the **Share** button to generate a collaboration link. Another user can open the shared link and pick the user name.

Now, multiple users can edit the same document collaboratively. Document changes, comments, and collaborator presence are synchronized in real time.

## APIs Used by the React Application

The React client communicates with the ASP.NET Core backend through the following HTTP endpoints.

| HTTP Method | API Endpoint | React Usage | Purpose |
|---|---|---|---|
| `GET` | `/api/Users` | `user-service.ts` | Loads the server-defined user directory used by the user picker and customized title bar. |
| `GET` | `/api/Users/{id}` | User API | Retrieves an individual user profile. |
| `POST` | `/api/CollaborativeEditing/ImportFile` | `DocumentEditor.tsx` | Loads the sample DOCX, applies pending Redis operations, and returns the current document as SFDT. |
| `POST` | `/api/CollaborativeEditing/UpdateAction` | Collaborative editing handler | Sends document operations to the server for Redis storage, transformation and SignalR distribution. |
| `POST` | `/api/CollaborativeEditing/GetActionsFromServer` | Collaborative editing handler | Retrieves document operations that the client has not synchronized. |
| `POST` | `/api/DocumentEditor/Import` | Document Editor service | Imports an uploaded supported document and converts it to Document Editor JSON/SFDT. |
| `POST` | `/api/DocumentEditor/SpellCheck` | Document Editor service | Provides spell-check suggestions. |
| `POST` | `/api/DocumentEditor/SpellCheckByPage` | Document Editor service | Performs page-level spell checking. |
| `POST` | `/api/DocumentEditor/SystemClipboard` | Document Editor service | Converts formatted clipboard content into Document Editor JSON. |
| `POST` | `/api/DocumentEditor/RestrictEditing` | Document Editor service | Computes the document editing-restriction hash. |

## SignalR Hub

The React application also uses the SignalR hub:

| Transport | Endpoint | Usage |
|---|---|---|
| SignalR/WebSocket | `/documenteditorhub` | Real-time collaborator presence and document-operation communication. |

Important hub operations are:

| Direction | Method/Event | Purpose |
|---|---|---|
| Client → Server | `JoinGroup` | Joins the specified collaboration room and registers the user in Redis presence. |
| Client → Server | `LeaveGroup` | Leaves the collaboration room. |
| Server → Client | `dataReceived` | Delivers collaborator additions/removals and document actions. |

The SignalR payload is also enriched with user profile information so the customized title bar can render remote avatars without an additional profile request for every collaboration event.

## Resources

- **Product page:**   [Syncfusion® React DOCX Editor](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

- **Documentation:**   [Syncfusion® React DOCX Editor - Documentation](https://help.syncfusion.com/document-processing/word/word-processor/react/overview?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

- **Online demo:**   [Syncfusion® React DOCX Editor - Online demo](https://document.syncfusion.com/demos/docx-editor/react/#/tailwind3/document-editor/default?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

## Support and feedback 

For any other queries, reach our [Syncfusion® support team](https://support.syncfusion.com/?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) or post the queries through the [community forums](https://www.syncfusion.com/forums?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 

Request new feature through [Syncfusion® feedback portal](https://www.syncfusion.com/feedback?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 

## License

This is a commercial product and requires a paid license for possession or use Syncfusion's licensed software, including this component, is subject to the terms and conditions of [Syncfusion's EULA](https://www.syncfusion.com/license/studio/syncfusion_essential_studio_eula.pdf?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). You can purchase a licnense [here](https://www.syncfusion.com/sales/products?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) or start a free 30\-day trial [here](https://www.syncfusion.com/account/manage-trials/start-trials?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 
