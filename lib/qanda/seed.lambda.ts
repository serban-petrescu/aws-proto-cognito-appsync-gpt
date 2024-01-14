import { postQuestion, postAnswer } from "./gql-handler.lambda";
import { CognitoIdentityProvider } from "@aws-sdk/client-cognito-identity-provider";

const SEED_DATA = [
  {
    question: { content: "What is a closure in JavaScript?" },
    answers: [
      {
        content: "A closure is a function having access to the parent scope.",
      },
      { content: "A closure is a function inside another parent function." },
    ],
  },
  {
    question: {
      content: "What is the difference between == and === in JavaScript?",
    },
    answers: [
      {
        content:
          "== checks for value equality and === checks for both value and type.",
      },
      {
        content:
          "== checks for value equality and === checks for type equality.",
      },
    ],
  },
  {
    question: { content: "What is a Promise in JavaScript?" },
    answers: [
      {
        content:
          "Promise is a proxy for a value not necessarily known when the promise is created.",
      },
      { content: "Promise is a way to handle asynchronous operations." },
    ],
  },
  {
    question: {
      content: "What is the use of the map function in JavaScript?",
    },
    answers: [
      { content: "Map function is used to transform elements in an array." },
      { content: "Map function is used to iterate over an array." },
    ],
  },
  {
    question: {
      content:
        "What is the difference between var, let and const in JavaScript?",
    },
    answers: [
      { content: "Var is function scoped, let and const are block scoped." },
      { content: "Var, let and const are all same." },
    ],
  },
];

const seedData = async () => {
  for (const data of SEED_DATA) {
    const questionEvent = { arguments: data.question };
    const postedQuestion = await postQuestion(questionEvent);
    for (const answer of data.answers) {
      await postAnswer({
        arguments: {
          ...answer,
          questionId: postedQuestion.id,
        },
      });
    }
  }
};

const cognito = new CognitoIdentityProvider();
const seedUsers = async () => {
  const userGroups = ["Readers", "Posters", "Moderators"];
  const password = "Password123!";

  for (const group of userGroups) {
    const username = group.substring(0, group.length - 1);
    await cognito.adminCreateUser({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username,
      UserAttributes: [
        {
          Name: "email",
          Value: `${username.toLowerCase()}@example.com`,
        },
      ],
      TemporaryPassword: password,
      MessageAction: "SUPPRESS",
    });

    await cognito.adminAddUserToGroup({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username,
      GroupName: group,
    });

    await cognito.adminSetUserPassword({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username,
      Password: password,
      Permanent: true,
    });
  }
};

export async function handler() {
  await seedData();
  await seedUsers();
  return { statusCode: 200, body: "Database seeded successfully" };
}
