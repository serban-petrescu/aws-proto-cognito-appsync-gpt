import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios from "axios";

async function handleTokenExchange(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const response = await axios.post(
    `https://${process.env.COGNITO_DOMAIN}/oauth2/token`,
    event.body,
    {
      headers: {
        Authorization: event.headers["Authorization"],
        "Content-Type": event.headers["content-type"],
      },
    }
  );
  const data = response.data ?? {};
  return {
    statusCode: response.status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, access_token: data.id_token }),
  };
}

async function callAppSync<T>(
  query: string,
  auth: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const url = `https://${process.env.APPSYNC_DOMAIN}/graphql`;
  const response = await axios({
    url: url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    data: { query, variables },
  });
  return response.data;
}

async function listQuestions(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const today = new Date().toISOString().split("T")[0];
  const authHeader =
    event.headers.Authorization || event.headers.authorization || "";
  const questions = await callAppSync<{
    data: { listQuestions: { items: any[] } };
  }>(
    `query ListQuestions($date: String!, $limit: Int!) {
        listQuestions(date: $date, limit: $limit) {
        items {
            id
            content
            createdAt
            answers {
                content
            }
        }
        }
    }`,
    authHeader,
    {
      date: today,
      limit: 5,
    }
  );
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(questions.data.listQuestions.items),
  };
}

async function postQuestion(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const authHeader =
    event.headers.Authorization || event.headers.authorization || "";
  const requestBody = JSON.parse(event.body ?? "{}");
  const questionResult = await callAppSync<{
    data: { postQuestion: { id: string } };
  }>(
    `mutation PostQuestion($content: String!) {
        postQuestion(content: $content) {
          id
        }
    }`,
    authHeader,
    {
      content: requestBody.question,
    }
  );
  const questionId = questionResult.data.postQuestion.id;
  const answerResult = await callAppSync<{
    data: { postAnswer: { id: string } };
  }>(
    `mutation PostAnswer($content: String!, $questionId: ID!) {
        postAnswer(content: $content, questionId: $questionId) {
            id
        }
    }`,
    authHeader,
    {
      content: requestBody.answer,
      questionId: questionId,
    }
  );
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: questionId,
      answerId: answerResult.data.postAnswer.id,
    }),
  };
}

async function postAnswer(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const authHeader =
    event.headers.Authorization || event.headers.authorization || "";
  const { content } = JSON.parse(event.body ?? "{}");
  const questionIdMatch = event.path.match(/\/questions\/([^\/]+)\/answers/);
  const questionId = questionIdMatch ? questionIdMatch[1] : null;

  if (!questionId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Question ID is required" }),
    };
  }

  const result = await callAppSync<{
    data: { postAnswer: { id: string } };
  }>(
    `mutation PostAnswer($content: String!, $questionId: ID!) {
        postAnswer(content: $content, questionId: $questionId) {
            id
            content
        }
    }`,
    authHeader,
    { content, questionId }
  );
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result.data.postAnswer),
  };
}

async function deleteQuestion(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const questionIdMatch = event.path.match(/\/questions\/([^\/]+)/);
  const questionId = questionIdMatch ? questionIdMatch[1] : null;
  if (!questionId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Question ID is required" }),
    };
  }

  const authHeader =
    event.headers.Authorization || event.headers.authorization || "";

  await callAppSync<{
    data: { deleteQuestion: boolean };
  }>(
    `mutation DeleteQuestion($questionId: ID!) {
        deleteQuestion(id: $questionId)
    }`,
    authHeader,
    { questionId }
  );

  return {
    statusCode: 204,
    headers: { "Content-Type": "application/json" },
    body: "",
  };
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (event.httpMethod === "POST" && event.path === "/oauth2/token") {
      return handleTokenExchange(event);
    } else if (event.httpMethod === "GET" && event.path === "/questions") {
      return listQuestions(event);
    } else if (event.httpMethod === "POST" && event.path === "/questions") {
      return postQuestion(event);
    } else if (
      event.httpMethod === "POST" &&
      event.path.match(/^\/questions\/[^\/]+\/answers$/)
    ) {
      return postAnswer(event);
    } else if (
      event.httpMethod === "DELETE" &&
      event.path.match(/^\/questions\/[^\/]+$/)
    ) {
      return deleteQuestion(event);
    } else {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Method Not Allowed" }),
      };
    }
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
}
