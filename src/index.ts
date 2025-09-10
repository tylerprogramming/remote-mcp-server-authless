import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	private static env?: any;

	async init() {
		// Simple addition tool
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			},
		);

		// Airtable query tool
		this.server.tool(
			"airtable_query",
			{
				baseId: z.string().describe("Airtable base ID (e.g., appBuiwwwXnKKzCY7)"),
				tableName: z.string().describe("Name of the table to query"),
				maxRecords: z.number().optional().describe("Maximum number of records to return"),
				view: z.string().optional().describe("Name of the view to use"),
				fields: z.array(z.string()).optional().describe("Specific fields to return"),
				filterByFormula: z.string().optional().describe("Airtable formula to filter records"),
			},
			async ({ baseId, tableName, maxRecords, view, fields, filterByFormula }) => {
				try {
					const apiToken = MyMCP.env?.AIRTABLE_API_TOKEN;
					if (!apiToken) {
						return {
							content: [
								{
									type: "text",
									text: "Error: AIRTABLE_API_TOKEN environment variable not set",
								},
							],
						};
					}

					const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
					
					if (maxRecords) {
						url.searchParams.append('maxRecords', maxRecords.toString());
					}
					if (view) {
						url.searchParams.append('view', view);
					}
					if (fields && fields.length > 0) {
						fields.forEach(field => url.searchParams.append('fields[]', field));
					}
					if (filterByFormula) {
						url.searchParams.append('filterByFormula', filterByFormula);
					}

					const response = await fetch(url.toString(), {
						headers: {
							'Authorization': `Bearer ${apiToken}`,
						},
					});

					if (!response.ok) {
						const errorText = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: ${response.status} ${response.statusText}\n${errorText}`,
								},
							],
						};
					}

					const data = await response.json();
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(data, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		
		// Set the environment for the static class
		MyMCP.env = env;

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
