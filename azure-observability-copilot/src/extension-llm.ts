// import fetch from 'node-fetch';

// Helper: Valid regions map
const regionMap: Record<string, string> = {
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

function normalizeRegion(region: string | null): string | null {
    if (!region) return region;

    const normalized = region.trim().toLowerCase();
    return regionMap[normalized] || normalized.replace(/\s+/g, '');
}



// Helper: Call Azure OpenAI API to extract parameters from user query
async function extractParametersWithAzureOpenAI(userQuery: string, azureApiKey: string, endpoint: string, deployment: string, apiVersion: string = "2025-01-01-preview"): Promise<any> {
    const prompt = `Extract the following parameters from the user's query. If a parameter is not present, return null.\n\n- function: (get_latency, check_errors, list_incidents)\n- region\n- date (in ISO format: YYYY-MM-DD)\n- start_date (in ISO format: YYYY-MM-DD)\n- end_date (in ISO format: YYYY-MM-DD)\n- status\n- error_code\n- compare\n- update_timestamp (in ISO format: YYYY-MM-DDTHH:MM:SSZ, if the user asks about an 'update' or 'since the update on [date]', extract that date as update_timestamp)\n\nReturn the result as a JSON object with these keys.\n\nUser query: "${userQuery}"`;

    const apiUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': azureApiKey
        },
        body: JSON.stringify({
            messages: [
                { role: 'system', content: 'You are a helpful assistant that extracts structured parameters from user queries.' },
                { role: 'user', content: prompt }
            ]
        })
    });

    const data = await response.json() as any;
    
    // Check if the response has an error
    if (data.error) {
        throw new Error(`Azure OpenAI API error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    // Check if choices exist
    if (!data.choices || !data.choices[0]) {
        throw new Error(`Invalid Azure OpenAI response: ${JSON.stringify(data)}`);
    }
    
    let params: Record<string, any> = {};
    try {
        params = JSON.parse(data.choices[0].message.content);
    } catch (e) {
        throw new Error('Failed to parse LLM response: ' + data.choices[0].message.content);
    }
    // Post-process: If update_timestamp is missing but query mentions 'update' and start_date or date is present, move it
    if (
        !params.update_timestamp &&
        /update/i.test(userQuery) &&
        (params.start_date || params.date)
    ) {
        params.update_timestamp = params.start_date || params.date;
        delete params.start_date;
        delete params.date;
        // Add time if missing
        if (/^\d{4}-\d{2}-\d{2}$/.test(params.update_timestamp)) {
            params.update_timestamp += 'T12:00:00Z';
        }
    }
    return params;
}

// Helper: Build Azure Function URL with only non-null parameters
function buildFunctionUrl(baseUrl: string, params: Record<string, any>): string {
    const query = Object.entries(params)
        .filter(([_, value]) => value !== null && value !== undefined && value !== "")
        .map(([key, value]) =>
            Array.isArray(value)
                ? value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&')
                : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .filter(Boolean)
        .join('&');
    return query ? `${baseUrl}?${query}` : baseUrl;
}

// Helper: Use Azure OpenAI to generate a natural language response
async function generateNaturalLanguageResponse(
    userQuery: string,
    backendData: any,
    azureApiKey: string,
    endpoint: string,
    deployment: string,
    apiVersion: string = "2025-01-01-preview"
): Promise<string> {
    const prompt = `You are Azure Observability Copilot, a helpful assistant. 
If the backend data only contains a single (most recent) latency entry for a region, treat this as the 'after update' value, and do not mention missing previous values. 
If the user asks if latency has increased since the last update and only one value is available, simply report the most recent latency as the current value after the update.

User query: "${userQuery}"

Backend data:
${JSON.stringify(backendData, null, 2)}

Respond in natural language:`;

    const apiUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': azureApiKey
        },
        body: JSON.stringify({
            messages: [
                { role: 'system', content: 'You are a helpful assistant that summarizes backend data for users.' },
                { role: 'user', content: prompt }
            ]
        })
    });

    const data = await response.json() as any;
    
    // Check if the response has an error
    if (data.error) {
        throw new Error(`Azure OpenAI API error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    // Check if choices exist
    if (!data.choices || !data.choices[0]) {
        throw new Error(`Invalid Azure OpenAI response: ${JSON.stringify(data)}`);
    }
    
    return data.choices[0].message.content.trim();
}

// Main handler for LLM-powered parameter extraction and backend call
async function handleUserQuery(userQuery: string, azureApiKey: string, endpoint: string, deployment: string) {
    // 1. Extract parameters from Azure OpenAI
    const params = await extractParametersWithAzureOpenAI(userQuery, azureApiKey, endpoint, deployment);
    
    // Add logic: If user asks about highest latency, set compare=true
    if (
        params.function === 'get_latency' &&
        /highest latency|most latency|which region has the highest latency|region with the highest latency/i.test(userQuery)
    ) {
        params.compare = true;
    }

    // Add logic: If user asks for the most recent latency, set date="recent"
    if (
        params.function === 'get_latency' &&
        /(most recent latency|latest latency|current latency|recent latency|latency right now)/i.test(userQuery)
    ) {
        params.date = "recent";
    }
    
    // 1a. If no function is detected, handle as greeting or non-API query
    if (!params.function) {
        // Simple greeting detection (expand as needed)
        const greetings = ['hi', 'hello', 'hey'];
        if (greetings.some(greet => userQuery.trim().toLowerCase().startsWith(greet))) {
            return "Hello! How can I assist you with Azure Observability today?";
        }
        // Fallback for other non-API queries
        return "I'm here to help with Azure Observability queries. Please ask about latency, errors, or incidents.";
    }
    
    // 1b. Normalize region if present
    if (params.region) {
        params.region = normalizeRegion(params.region);
    }

    // 2. Decide which function to call
    let baseUrl = '';
    if (params.function === 'get_latency') {
        baseUrl = 'https://az-observability.azurewebsites.net/api/get_latency';
    } else if (params.function === 'check_errors') {
        baseUrl = 'https://az-observability.azurewebsites.net/api/check_errors';
    } else if (params.function === 'list_incidents') {
        baseUrl = 'https://az-observability.azurewebsites.net/api/list_incidents';
    } else {
        throw new Error('Unknown function type from LLM');
    }
    // 3. Build the function URL
    const url = buildFunctionUrl(baseUrl, params);
    // 4. Call your Azure Function
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    const result = await response.json();

    // 5. Generate a natural language response using the LLM
    const nlResponse = await generateNaturalLanguageResponse(userQuery, result, azureApiKey, endpoint, deployment);
    return nlResponse;
}

// Export for use in your extension
export { extractParametersWithAzureOpenAI, buildFunctionUrl, handleUserQuery };
