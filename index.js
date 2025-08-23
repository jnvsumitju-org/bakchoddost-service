export const handler = async (event) => {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
      message: "Hello from Lambda!",
      path: event.rawPath,
      query: event.queryStringParameters,
    }),
    };
  };
  