// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { handleUserQuery } from './extension-llm';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const participantId = 'azure-observability-copilot';

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "azure-observability-copilot" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('azure-observability-copilot.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Azure Observability Copilot!');
	});

	context.subscriptions.push(disposable);
	
	const outputChannel = vscode.window.createOutputChannel('Azure Observability Copilot');

	// Azure OpenAI config
	const endpoint = "https://az-observability.openai.azure.com";
	const deployment = "gpt-4.1";
	const azureApiKey = process.env.AZURE_OPENAI_KEY || ""; // Set this in your environment

	const handler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	) => {
		const userQuery = request.prompt;
		if (!azureApiKey) {
			outputChannel.appendLine("[CHAT] Azure OpenAI API key is not set.");
			await stream.markdown("Error: Azure OpenAI API key is not set. Please configure it in your settings.");
			return;
		}
		let responseMessage = "";
		try {
			const result = await handleUserQuery(userQuery, azureApiKey, endpoint, deployment);
			responseMessage = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
		} catch (err: any) {
			responseMessage = `Error: ${err.message}`;
		}
		await stream.markdown(responseMessage);
		outputChannel.appendLine(`[CHAT] Response: ${responseMessage}`);
	};

	vscode.chat.createChatParticipant(participantId, handler);

}

// This method is called when your extension is deactivated
export function deactivate() {}
