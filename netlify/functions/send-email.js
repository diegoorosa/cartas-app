// ARQUIVO DE TESTE: netlify/functions/send-email.js

exports.handler = async (event) => {
  // Log para ver se a função acorda
  console.log("Função send-email chamada!");

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "A função existe e está viva!" })
  };
};