// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';

// Create a single output channel for the extension at the top level
const outputChannel = vscode.window.createOutputChannel('Azure Observability Copilot');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	outputChannel.appendLine('Azure Observability Copilot extension activated.');
	outputChannel.show(true);

	console.log('Congratulations, your extension "azure-observability-copilot" is now active!');

	// Load Copilot skills from copilot-skills.json
	const skillsPath = path.join(context.extensionPath, 'copilot-skills.json');
	let skills: any[] = [];
	try {
		const skillsRaw = fs.readFileSync(skillsPath, 'utf8');
		const skillsJson = JSON.parse(skillsRaw);
		skills = skillsJson.skills;
		console.log('Loaded Copilot skills:', skills);
	} catch (err) {
		console.error('Failed to load copilot-skills.json:', err);
	}

	// Register a Copilot Chat participant for natural language queries
	const participantId = 'azure-observability-copilot';
	// Capture extension context for use in chat handler
	const extensionContext = context;
	const chatHandler: vscode.ChatRequestHandler = async (request, chatContext, stream, token) => {
		try {
			// Remove outputChannel.appendLine and outputChannel.show, replace with sendLogToBackend for all log messages
			await sendLogToBackend({
				timestamp: new Date().toISOString(),
				event: 'chat_handler_triggered',
				message: 'Chat handler triggered',
				requestPrompt: request.prompt
			});

			await sendLogToBackend({
				timestamp: new Date().toISOString(),
				event: 'chat_handler_start',
				message: '--- Chat handler START ---'
			});

			const userMessage = request.prompt.toLowerCase();
			console.log('Chat handler received message:', userMessage);

			// Improved skill matching: match skill name with or without underscores/spaces
			const matchedSkill = skills.find(skill =>
				userMessage.startsWith(skill.skill) ||
				userMessage.startsWith(skill.skill.replace('_', ' ')) ||
				userMessage.includes(skill.skill) ||
				userMessage.includes(skill.skill.replace('_', ' '))
			);
			if (!matchedSkill) {
				await sendLogToBackend({
					timestamp: new Date().toISOString(),
					event: 'no_skill_matched',
					message: 'No skill matched',
					userMessage
				});
				stream.markdown(`Sorry, I couldn't match your request to a known skill.`);
				return;
			}
			await sendLogToBackend({
				timestamp: new Date().toISOString(),
				event: 'skill_matched',
				message: 'Skill matched',
				skill: matchedSkill.skill
			});

			// Extract parameters from "key: value" pairs
			const params: Record<string, string> = {};
			const paramRegex = /(\w+):\s*([\w-]+)/g;
			let match;
			while ((match = paramRegex.exec(userMessage)) !== null) {
				params[match[1]] = match[2];
			}
			await sendLogToBackend({
				timestamp: new Date().toISOString(),
				event: 'params_extracted',
				message: 'Params extracted',
				params
			});

			const normalizedUserMsg = userMessage.replace(/\s+/g, "");
			await sendLogToBackend({
				timestamp: new Date().toISOString(),
				event: 'normalized_user_message',
				message: 'Normalized user message',
				normalizedUserMsg
			});

			// --- New: Extract region and date from natural language ---
			// Region extraction (add more as needed)
			// --- Improved: Region extraction ignores spaces ---
			const regionList = [
				"eastus", "westus", "northeurope", "westeurope", "centralus", "southcentralus"
			];
			let regionFound = false;
			for (const region of regionList) {
				if (normalizedUserMsg.includes(region)) {
					params["region"] = region;
					await sendLogToBackend({
						timestamp: new Date().toISOString(),
						event: 'region_detected',
						message: 'Region detected and set',
						region: params["region"]
					});
					regionFound = true;
					break;
				}
			}
			if (!regionFound) {
				await sendLogToBackend({
					timestamp: new Date().toISOString(),
					event: 'no_region_detected',
					message: 'No region detected in user message.'
				});
			}
			// Date extraction and conversion to ISO format
			const now = new Date();
			if (userMessage.includes("today")) {
				// Format: YYYY-MM-DD
				const yyyy = now.getFullYear();
				const mm = String(now.getMonth() + 1).padStart(2, '0');
				const dd = String(now.getDate()).padStart(2, '0');
				params["date"] = `${yyyy}-${mm}-${dd}`;
			} else if (userMessage.includes("yesterday")) {
				const yesterday = new Date(now);
				yesterday.setDate(now.getDate() - 1);
				const yyyy = yesterday.getFullYear();
				const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
				const dd = String(yesterday.getDate()).padStart(2, '0');
				params["date"] = `${yyyy}-${mm}-${dd}`;
			} else if (userMessage.includes("recent")) {
				params["date"] = "recent";
			}
			// --- End new ---

			// If region is present and no date is specified, default to date=recent
			if (params["region"] && !params["date"]) {
				params["date"] = "recent";
			}

			await sendLogToBackend({
				timestamp: new Date().toISOString(),
				event: 'final_params',
				message: 'Final params before URL construction',
				params
			});

			// Use your deployed API URL here!
			const apiUrl = `https://az-observability.azurewebsites.net/api/${matchedSkill.skill}`;
			const url = new URL(apiUrl);
			Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

			// --- Remove file logging, replace with backend logging ---
			// Log backend URL and params to backend logging endpoint
			await sendLogToBackend({
				timestamp: new Date().toISOString(),
				event: 'backend_url_constructed',
				url: url.toString(),
				params
			});
			outputChannel.appendLine('Calling backend URL: ' + url.toString());
			outputChannel.show(true);

			outputChannel.appendLine('About to call backend: ' + matchedSkill.skill);
			outputChannel.show(true);
			try {
				const response = await new Promise<string>((resolve, reject) => {
					https.get(url.toString(), (res) => {
						let data = '';
						res.on('data', chunk => data += chunk);
						res.on('end', () => resolve(data));
					}).on('error', reject);
				});
				outputChannel.appendLine(`Backend response for ${matchedSkill.skill}: ${response}`);
				outputChannel.show(true);
				// Log backend response
				await sendLogToBackend({
					timestamp: new Date().toISOString(),
					event: 'backend_response',
					skill: matchedSkill.skill,
					url: url.toString(),
					params,
					response
				});
				stream.markdown(`**${matchedSkill.skill} result:**\n\n${response}`);
			} catch (err) {
				outputChannel.appendLine(`Failed to call backend: ${err}`);
				outputChannel.show(true);
				// Log backend error
				await sendLogToBackend({
					timestamp: new Date().toISOString(),
					event: 'backend_error',
					skill: matchedSkill.skill,
					url: url.toString(),
					params,
					error: String(err)
				});
				stream.markdown(`Failed to call backend: ${err}`);
			}
		} catch (err) {
			outputChannel.appendLine('UNCAUGHT ERROR in chat handler: ' + err);
			outputChannel.show(true);
			vscode.window.showErrorMessage('UNCAUGHT ERROR in chat handler: ' + err);
		}
	};
	vscode.chat.createChatParticipant(participantId, chatHandler);

	// Optionally, set an icon for the chat participant
	// chatParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('azure-observability-copilot.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Azure Observability Copilot!');
	});
	context.subscriptions.push(disposable);

	// Add a command to manually test skill queries
	const testSkillCommand = vscode.commands.registerCommand('azure-observability-copilot.testSkill', async () => {
		const input = await vscode.window.showInputBox({
			prompt: 'Enter skill query as JSON (e.g., { "skill": "get_latency", "region": "eastus" })'
		});
		if (!input) {
			return;
		}
		let params: any = {};
		try {
			params = JSON.parse(input);
		} catch (e) {
			vscode.window.showErrorMessage('Invalid JSON.');
			return;
		}
		const skillName = params.skill;
		if (!skillName) {
			vscode.window.showErrorMessage('Missing "skill" property.');
			return;
		}
		const matchedSkill = skills.find(skill => skill.skill === skillName);
		if (!matchedSkill) {
			vscode.window.showErrorMessage('Unknown skill: ' + skillName);
			return;
		}
		const apiUrl = `http://localhost:7071/api/${skillName}`;
		const url = new URL(apiUrl);
		Object.entries(params).forEach(([key, value]) => {
			if (key !== 'skill') {
				url.searchParams.append(key, value as string);
			}
		});
		try {
			const response = await new Promise<string>((resolve, reject) => {
				http.get(url.toString(), (res) => {
					let data = '';
					res.on('data', chunk => data += chunk);
					res.on('end', () => {
						if (res.statusCode && res.statusCode >= 400) {
							reject(`HTTP ${res.statusCode}: ${data}`);
						} else {
							resolve(data);
						}
					});
				}).on('error', (err) => {
					console.error('HTTP request error:', err);
					reject(err);
				});
			});
			if (!response) {
				vscode.window.showWarningMessage(`No response received from backend for ${skillName}.`);
			} else {
				vscode.window.showInformationMessage(`Result for ${skillName}: ${response}`);
			}
		} catch (err) {
			console.error('Failed to call backend:', err);
			vscode.window.showErrorMessage(`Failed to call backend: ${err}`);
		}
	});
	context.subscriptions.push(testSkillCommand);

	// Test command to force output channel to show
	const showOutputTest = vscode.commands.registerCommand('azure-observability-copilot.showOutputTest', () => {
		outputChannel.appendLine('Test: Output channel forced to show.');
		outputChannel.show(true);
	});
	context.subscriptions.push(showOutputTest);
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Utility function to send logs to backend logging endpoint
async function sendLogToBackend(log: Record<string, any>) {
	try {
		const logEndpoint = 'https://az-observability.azurewebsites.net/api/log_event'; // Update if needed
		const data = JSON.stringify(log);
		const url = new URL(logEndpoint);
		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(data)
			}
		};
		await new Promise<void>((resolve, reject) => {
			const req = https.request(url, options, (res) => {
				res.on('data', () => {}); // ignore response body
				res.on('end', resolve);
			});
			req.on('error', reject);
			req.write(data);
			req.end();
		});
	} catch (e) {
		outputChannel.appendLine('Failed to send log to backend: ' + e);
	}
}

// Utility function to append logs to a file in the user's home directory
function appendLogToFile(log: Record<string, any>) {
    try {
        const logFilePath = path.join(os.homedir(), 'az-copilot-log.txt');
        fs.appendFileSync(logFilePath, JSON.stringify(log) + '\n');
    } catch (e) {
        // Fallback: ignore file write errors
    }
}
