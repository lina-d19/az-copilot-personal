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



// Helper: Generate KQL query from user query using Azure OpenAI
async function generateKQLQuery(userQuery: string, azureApiKey: string, endpoint: string, deployment: string, apiVersion: string = "2025-01-01-preview"): Promise<string> {
    const prompt = `Convert this user query into a valid KQL query for Azure Log Analytics.

Available tables and common fields:
- AppRequests: timestamp, cloud_RoleName, operation_Name, duration, resultCode, client_CountryOrRegion
- AppTraces: timestamp, message, severityLevel, cloud_RoleName
- AppExceptions: timestamp, type, outerMessage, cloud_RoleName
- AppPerformanceCounters: timestamp, category, counter, value, cloud_RoleName

Common operators: where, summarize, avg(), max(), min(), count(), ago(), bin()
Time functions: ago(5h), ago(1d), startofday(now())

User query: "${userQuery}"

Generate only the KQL query without explanation:`;

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
                { role: 'system', content: 'You are an expert in KQL (Kusto Query Language) for Azure Log Analytics. Generate clean, executable KQL queries.' },
                { role: 'user', content: prompt }
            ]
        })
    });

    const data = await response.json() as any;
    
    if (data.error) {
        throw new Error(`Azure OpenAI API error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    if (!data.choices || !data.choices[0]) {
        throw new Error(`Invalid Azure OpenAI response: ${JSON.stringify(data)}`);
    }
    
    return data.choices[0].message.content.trim();
}

// Helper: Call Azure OpenAI API to extract parameters from user query (legacy method)
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

// Helper: Simulate KQL execution on mock data
function simulateKQLExecution(kqlQuery: string, mockData: any[]): any {
    console.log(`Executing KQL: ${kqlQuery}`);
    
    // Simple KQL parser for demo purposes
    let result = mockData;
    
    // Extract table name
    const tableMatch = kqlQuery.match(/^(AppRequests|AppTraces|AppExceptions|AppPerformanceCounters)/);
    if (tableMatch) {
        const table = tableMatch[1];
        result = result.filter(item => item.table === table);
    }
    
    // Handle time range filters (ago function)
    const agoMatch = kqlQuery.match(/ago\((\d+)([hd])\)/);
    if (agoMatch) {
        const value = parseInt(agoMatch[1]);
        const unit = agoMatch[2]; // 'h' for hours, 'd' for days
        const multiplier = unit === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        const cutoffTime = new Date(Date.now() - value * multiplier);
        
        result = result.filter(item => new Date(item.timestamp) > cutoffTime);
    }
    
    // Handle region filters
    const regionMatch = kqlQuery.match(/cloud_RoleName\s*==\s*["']([^"']+)["']/);
    if (regionMatch) {
        const region = regionMatch[1];
        result = result.filter(item => item.cloud_RoleName === region || item.region === region);
    }
    
    // Handle summarize avg(duration)
    if (kqlQuery.includes('summarize') && kqlQuery.includes('avg(duration)')) {
        if (result.length === 0) {
            return { average_duration: 0, count: 0 };
        }
        const sum = result.reduce((acc, item) => acc + (item.duration || item.latency || 0), 0);
        return { 
            average_duration: Math.round(sum / result.length), 
            count: result.length,
            table: result[0]?.table || 'AppRequests'
        };
    }
    
    // Handle summarize count()
    if (kqlQuery.includes('summarize') && kqlQuery.includes('count()')) {
        return { 
            count: result.length,
            table: result[0]?.table || 'AppRequests'
        };
    }
    
    // Handle summarize max(duration)
    if (kqlQuery.includes('summarize') && kqlQuery.includes('max(duration)')) {
        if (result.length === 0) {
            return { max_duration: 0, count: 0 };
        }
        const max = Math.max(...result.map(item => item.duration || item.latency || 0));
        return { 
            max_duration: max, 
            count: result.length,
            table: result[0]?.table || 'AppRequests'
        };
    }
    
    // Handle group by cloud_RoleName
    if (kqlQuery.includes('by cloud_RoleName')) {
        const grouped = result.reduce((acc, item) => {
            const key = item.cloud_RoleName || item.region || 'unknown';
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {} as Record<string, any[]>);
        
        if (kqlQuery.includes('avg(duration)')) {
            return Object.entries(grouped).map(([region, items]) => ({
                cloud_RoleName: region,
                average_duration: Math.round((items as any[]).reduce((sum: number, item: any) => sum + (item.duration || item.latency || 0), 0) / (items as any[]).length),
                count: (items as any[]).length
            }));
        }
        
        return Object.entries(grouped).map(([region, items]) => ({
            cloud_RoleName: region,
            count: (items as any[]).length
        }));
    }
    
    // Default: return filtered data
    return result;
}

// Mock data for simulation
const mockLogAnalyticsData = [
    { timestamp: "2025-01-20T10:00:00Z", cloud_RoleName: "eastus", duration: 45, table: "AppRequests", operation_Name: "GET /api/data" },
    { timestamp: "2025-01-20T11:00:00Z", cloud_RoleName: "eastus", duration: 52, table: "AppRequests", operation_Name: "POST /api/update" },
    { timestamp: "2025-01-20T12:00:00Z", cloud_RoleName: "westus", duration: 38, table: "AppRequests", operation_Name: "GET /api/data" },
    { timestamp: "2025-01-20T13:00:00Z", cloud_RoleName: "westus", duration: 41, table: "AppRequests", operation_Name: "GET /api/status" },
    { timestamp: "2025-01-20T09:00:00Z", cloud_RoleName: "eastus", duration: 159, table: "AppRequests", operation_Name: "GET /api/heavy" },
    { timestamp: "2025-01-20T14:00:00Z", cloud_RoleName: "northeurope", duration: 33, table: "AppRequests", operation_Name: "GET /api/data" },
    { timestamp: "2025-01-20T10:30:00Z", cloud_RoleName: "eastus", severityLevel: 3, message: "Error processing request", table: "AppTraces" },
    { timestamp: "2025-01-20T11:30:00Z", cloud_RoleName: "westus", severityLevel: 2, message: "Warning: slow response", table: "AppTraces" },
];

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

// Main handler for KQL-powered queries
async function handleUserQueryWithKQL(userQuery: string, azureApiKey: string, endpoint: string, deployment: string) {
    try {
        // 1. Generate KQL query from user input
        const kqlQuery = await generateKQLQuery(userQuery, azureApiKey, endpoint, deployment);
        console.log(`Generated KQL: ${kqlQuery}`);
        
        // 2. Simulate execution on mock data
        const queryResult = simulateKQLExecution(kqlQuery, mockLogAnalyticsData);
        console.log(`Query Result:`, queryResult);
        
        // 3. Generate natural language response
        const nlResponse = await generateNaturalLanguageResponse(
            userQuery, 
            { kql_query: kqlQuery, results: queryResult }, 
            azureApiKey, 
            endpoint, 
            deployment
        );
        
        return nlResponse;
    } catch (error) {
        console.error('Error in KQL handler:', error);
        // Fallback to original method
        return await handleUserQuery(userQuery, azureApiKey, endpoint, deployment);
    }
}

// Main handler for LLM-powered parameter extraction and backend call (legacy method)
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
export { extractParametersWithAzureOpenAI, buildFunctionUrl, handleUserQuery, generateKQLQuery, simulateKQLExecution, handleUserQueryWithKQL };
