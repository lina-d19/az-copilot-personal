// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// Helper: Valid regions map
const validRegions: Record<string, string> = {
	"east us": "eastus",
	"west us": "westus",
	"north europe": "northeurope",
	"central us": "centralus",
	"west europe": "westeurope",
	"eastus": "eastus",
	"westus": "westus",
	"northeurope": "northeurope",
	"centralus": "centralus",
	"westeurope": "westeurope"
};

// Helper: Extract and validate region from the request prompt
function extractRegion(prompt: string): string {
	const match = prompt.match(/in ([a-z ]+)/i);
	const regionRaw = match?.[1]?.trim().toLowerCase() ?? "";
	return validRegions[regionRaw] || "";
}

// Helper: Call backend API
async function fetchObservabilityData(
	endpoint: string,
	region: string,
	outputChannel: vscode.OutputChannel
	): Promise<any> {
		const url = region
			? `https://az-observability.azurewebsites.net/api/${endpoint}?region=${region}`
			: `https://az-observability.azurewebsites.net/api/${endpoint}`;
		outputChannel.appendLine(`[CHAT] Fetching data from: ${url}`);
		const res = await fetch(url);
		const json = await res.json();
		outputChannel.appendLine(`[CHAT] Response: ${JSON.stringify(json)}`);

		if (!res.ok) {
			throw new Error(`Failed to fetch data: ${res.statusText}`);
	}
	return json;
}

// Helper: Format region for display (capitalize first letter of each word and add spaces)
function formatRegionDisplay(region: string): string {
    let formatted = region
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-z]+)(us|europe|canada|west|central|north|south|east|southeast|northeast|southcentral|northcentral|southwest|northwest)/gi, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    formatted = formatted.split(' ').map(word => {
        return word.toLowerCase() === 'us' ? 'US' : word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
    return formatted;
}

// Update formatIncidentList to accept regionDisplay
function formatIncidentList(incidents: any[], region: string, regionDisplay?: string): string {
    const filtered = region
        ? incidents.filter(inc => (inc.region || "").toLowerCase() === region)
        : incidents;

    if (filtered.length === 0) {
        return region
            ? `No recent service incidents in ${regionDisplay || region}.`
            : "No recent service incidents found.";
    }

    filtered.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0).getTime();
        const dateB = new Date(b.timestamp || 0).getTime();
        return dateB - dateA;
    });

    const lines = filtered.map(inc => {
        const date = (inc.timestamp || "").slice(0, 10);
        const desc = inc.description || "";
        const status = (inc.status || "").toLowerCase();
        return `${date}: ${desc} (${status})`;
    });

    const regionLabel = region
        ? `Recent service incidents in ${regionDisplay || region} include:`
        : "Recent service incidents include:";

    // Join with double newline for each entry to ensure markdown line breaks
    return `${regionLabel}\n\n${lines.join('\n\n')}`;
}

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

	const handler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	) => {
		const prompt = request.prompt.toLowerCase();
		const region = extractRegion(prompt); // Use for API call
		const regionDisplay = region ? formatRegionDisplay(region) : ""; // Use for response

		let endpoint = "";

		let responseMessage = "";

		if (prompt.includes("hi") || prompt.includes("hello")) {
			responseMessage = "Hello! How can I assist you with Azure Observability today?";
		} else if (prompt.includes("latency")) {
			endpoint = "get_latency";
			const data = await fetchObservabilityData(endpoint, region, outputChannel);
			responseMessage = region
				? `The average latency in ${regionDisplay} is ${data.averageLatencyMs} milliseconds.`
				: `The average latency across all regions is ${data.averageLatencyMs} milliseconds.`;	
		} else if (prompt.includes("errors")) {
			endpoint = "check_errors";
			const data = await fetchObservabilityData(endpoint, region, outputChannel);
			responseMessage = region
				? `There are ${data.totalErrors} errors in ${regionDisplay}.`
				: `There are ${data.totalErrors} errors across all regions.`;
		} else if (prompt.includes("incidents")) {
			endpoint = "list_incidents";
			const data = await fetchObservabilityData(endpoint, region, outputChannel);
			responseMessage = formatIncidentList(data.incidents, region, regionDisplay);
		} else {
			responseMessage = "Sorry, I didn't understand your request.";
		}


		await stream.markdown(responseMessage);
		outputChannel.appendLine(`[CHAT] Response: ${responseMessage}`);
	};

	vscode.chat.createChatParticipant(participantId, handler);

}

// This method is called when your extension is deactivated
export function deactivate() {}
