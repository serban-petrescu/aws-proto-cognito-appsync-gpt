import { AppSyncResolverEvent, AppSyncResolverHandler } from "aws-lambda";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { v4 as uuid } from "uuid";

interface Question {
  id: string;
  content: string;
  answers: string[];
  createdAt: string;
}

interface Answer {
  id: string;
  content: string;
  questionId: string;
  createdAt: string;
}

const ddb = DynamoDBDocument.from(new DynamoDBClient());

interface ListQuestionsInput {
  date: string;
  limit: number;
  nextToken: string;
}

async function listQuestions(event: {
  arguments: ListQuestionsInput;
}): Promise<{ items: Question[]; nextToken: string | null }> {
  const { date, limit, nextToken } = event.arguments;
  const { Items, LastEvaluatedKey } = await ddb.query({
    TableName: process.env.DYNAMODB_TABLE,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": date,
    },
    Limit: limit,
    ScanIndexForward: false,
    ExclusiveStartKey: nextToken ? { pk: date, sk: nextToken } : undefined,
  });
  return {
    items: (Items ?? []) as Question[],
    nextToken: LastEvaluatedKey ? LastEvaluatedKey.sk : null,
  };
}

interface PostQuestionInput {
  content: string;
}

export async function postQuestion(event: {
  arguments: PostQuestionInput;
}): Promise<Question> {
  const { content } = event.arguments;
  const createdAt = new Date().toISOString();
  const id = `${createdAt}#${uuid()}`;
  const question: Question = {
    id,
    content,
    answers: [],
    createdAt,
  };
  await ddb.put({
    TableName: process.env.DYNAMODB_TABLE,
    Item: {
      pk: id.split("T")[0],
      sk: id,
      ...question,
    },
  });
  return question;
}

interface PostAnswerInput {
  content: string;
  questionId: string;
}

export async function postAnswer(event: {
  arguments: PostAnswerInput;
}): Promise<Answer> {
  const { content, questionId } = event.arguments;
  const createdAt = new Date().toISOString();
  const id = `${createdAt}#${uuid()}`;
  const answer: Answer = {
    id,
    content,
    questionId,
    createdAt,
  };
  await ddb.update({
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      pk: questionId.split("T")[0],
      sk: questionId,
    },
    UpdateExpression:
      "SET answers = list_append(if_not_exists(answers, :empty), :answer)",
    ExpressionAttributeValues: {
      ":answer": [answer],
      ":empty": [],
    },
    ReturnValues: "NONE",
  });
  return answer;
}

interface DeleteQuestionInput {
  id: string;
}

async function deleteQuestion(event: {
  arguments: DeleteQuestionInput;
}): Promise<boolean> {
  const { id } = event.arguments;
  await ddb.delete({
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      pk: id.split("T")[0],
      sk: id,
    },
  });
  return true;
}

const handler: AppSyncResolverHandler<any, any> = async (event) => {
  switch (event.info.fieldName) {
    case "listQuestions":
      return listQuestions(event);
    case "postQuestion":
      return postQuestion(event);
    case "postAnswer":
      return postAnswer(event);
    case "deleteQuestion":
      return deleteQuestion(event);
    default:
      return null;
  }
};

export { handler };
