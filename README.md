# Eliminate Document Version Conflicts with Real-Time Collaborative Editing in React DOCX Editor

This repository contains an example of how to perform real-time collaborative editing on Word documents using the [Syncfusion® React DOCX Editor](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor?utm_source=github&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026) (Document Editor). It showcases how multiple users can open the same DOCX file, join a shared collaboration session, and edit the document together in real time directly within the browser.

This sample demonstrates a complete collaborative document workflow using a React client application and an ASP.NET Core backend. Azure Blob Storage is used to store and browse Word documents, while SignalR and Redis are used to synchronize document changes and collaborator presence across connected users.

## How to run the application

Clone the repository to your local machine.

Configure the required Azure Blob Storage and Redis connection details in the server-side `appsettings.json` file.

```json
{
  "AzureBlobStorage": {
    "ConnectionString": "<your-azure-blob-storage-connection-string>",
    "ContainerName": "<your-container-name>",
    "RootFolderName": "<your-root-folder-name>"
  },
  "Redis": {
    "ConnectionString": "<your-redis-connection-string>"
  }
}
```

Run the Server Application. The Syncfusion Document Editor requires a server-side backend for processing Word documents, loading files from Azure Blob Storage, and handling collaborative editing operations.

```bash
dotnet restore
dotnet build
dotnet run
```

Install Dependencies. Install the required npm packages for the React client application.

```bash
npm install
```

Run the Application. Start the React development client.

```bash
npm run dev
```

This will start the application in your browser using the local URL shown in the terminal.

Open the application in a browser. The File Manager displays the Word documents stored in Azure Blob Storage.

Select a DOCX file from the File Manager and enter a username to open the document in the Syncfusion React DOCX Editor.

Click the **Share** button to generate a collaboration link. Another user can open the shared link and enter their username.

Now, multiple users can edit the same document collaboratively. Document changes, comments, and collaborator presence are synchronized in real time.

# Resources

* **Product page:**   [Syncfusion® DOCX Editor](https://www.syncfusion.com/docx-editor-sdk?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026) 
* **Documentation**   [Collaborative Editing in React - Documentation](https://help.syncfusion.com/document-processing/word/word-processor/react/collaborative-editing/using-redis-cache-asp-net-core?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026) 
* **Online demo:**   [React DOCX Editor - Collaborative Editing - Online demo](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor/collaborative-editing?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026) 

# Support and feedback 

For any other queries, reach our [Syncfusion® support team](https://support.syncfusion.com/?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026) or post the queries through the [community forums](https://www.syncfusion.com/forums?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026). 

Request new feature through [Syncfusion® feedback portal](https://www.syncfusion.com/feedback?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026). 

# License

This is a commercial product and requires a paid license for possession or use. Syncfusion's licensed software, including this component, is subject to the terms and conditions of [Syncfusion's EULA](https://www.syncfusion.com/license/studio/22.2.5/syncfusion_essential_studio_eula.pdf?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026). You can purchase a license [here](https://www.syncfusion.com/sales/pricing?category=ui-components?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026) or start a free 30-day trial [here](https://www.syncfusion.com/account/manage-trials/start-trials?utm_source=github_&utm_medium=webinar&utm_campaign=webinar_es_reactcollabedit_july2026).

