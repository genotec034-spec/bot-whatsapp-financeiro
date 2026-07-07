const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Configurações das Variáveis de Ambiente do Render
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// Servidor HTTP obrigatório para o Render manter o seu bot online 24/7
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Telegram Bot Online\n');
}).listen(port, () => console.log(`Servidor rodando na porta ${port}`));

// Inicializa o bot do Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log("🚀 BOT DE FINANÇAS INTEGRADO E ATIVO!");

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    const nomeUsuario = msg.from.first_name || "Usuário";

    if (!texto) return;

    // Comando Inicial / Boas-vindas
    if (texto.toLowerCase() === '/start' || texto.toLowerCase() === 'oi') {
        bot.sendMessage(chatId, `👋 Olá ${nomeUsuario}! Já estou pronto para organizar sua planilha.\n\n📝 *Como mandar os gastos:* \n_"Gastei 15 + 20 de morangos na Loja"_\n_"Entrou 450 de vendas hoje na Loja"_\n_"Paguei 120 de luz na Casa ontem"_`, { parse_mode: 'Markdown' });
        return;
    }

    // Comando para ver a Planilha direto pelo Telegram
    if (texto.toLowerCase() === '/planilha') {
        // 💡 DICA: Substitua o link abaixo pelo link real da sua planilha se quiser abrir direto
        const linkPlanilha = "https://docs.google.com/spreadsheets/"; 
        bot.sendMessage(chatId, `📊 *Link da sua Planilha de Lançamentos:*\n\n[Clique aqui para abrir a Planilha](${linkPlanilha})`, { parse_mode: 'Markdown' });
        return;
    }

    try {
        bot.sendMessage(chatId, "🤖 Processando com Inteligência Artificial...");

        // 1. Envia o texto para o Gemini 2.5 estruturar e calcular
        const resultadoGemini = await processarComGemini(texto);

        if (resultadoGemini.erro) {
            bot.sendMessage(chatId, `❌ Erro na Inteligência Artificial:\n\`${resultadoGemini.mensagem}\``, { parse_mode: 'Markdown' });
            return;
        }

        const dadosPlanilha = resultadoGemini.dados;
        dadosPlanilha.usuario = nomeUsuario; // Define quem enviou a mensagem

        // Garante que o valor saia do bot como número puro (sem aspas de texto)
        if (dadosPlanilha.valor) {
            dadosPlanilha.valor = Number(dadosPlanilha.valor);
        }

        // 2. Envia os dados para o Google Apps Script usando FETCH nativo (evita erros de redirecionamento)
        const respostaGoogle = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosPlanilha)
        });

        const textoResposta = await respostaGoogle.text();

        // 3. Se a planilha responder OK, exibe o comprovante bonitinho no Telegram
        if (textoResposta.trim() === "OK") {
            const sucesso = `✅ *Lançamento Salvo com Sucesso!*\n\n📅 *Data:* ${dadosPlanilha.data}\n🏦 *Conta:* ${dadosPlanilha.conta}\n📊 *Tipo:* ${dadosPlanilha.tipo}\n🏷️ *Categoria:* ${dadosPlanilha.categoria}\n📝 *Descrição:* ${dadosPlanilha.descricao}\n💰 *Valor:* R$ ${Number(dadosPlanilha.valor).toFixed(2)}\n👤 *Por:* ${dadosPlanilha.usuario}`;
            bot.sendMessage(chatId, sucesso, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `⚠️ O script do Google respondeu, mas não retornou OK. Resposta do servidor: ${textoResposta}`);
        }

    } catch (erro) {
        bot.sendMessage(chatId, "❌ Erro interno no servidor do bot: " + erro.message);
    }
});

// Função interna que gerencia a IA do Google Gemini
async function processarComGemini(textoUsuario) {
    try {
        // Conexão com o endpoint estável v1beta e o modelo correto gemini-2.5-flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        // Captura a data de hoje diretamente no fuso horário do Brasil
        const dataHojeBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const prompt = `Você é um contador e analista financeiro sênior. Sua tarefa é extrair os dados do texto do usuário e formatá-los em um JSON perfeito.
        
Data de hoje como referência: ${dataHojeBR}

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
1. data: Deve ser estritamente no formato brasileiro DD/MM/YYYY. Se o usuário falar "ontem", "anteontem" ou citar dias da semana, faça o cálculo matemático da data correta baseado na data de hoje e converta para DD/MM/YYYY.
2. valor: Deve ser um número decimal puro (ex: 35.00). SE O USUÁRIO ENVIAR UMA SOMA OU CÁLCULO (ex: "12 + 15 + 8", "30 reais mais 5.50"), VOCÊ DEVE SOMAR E FAZER O CÁLCULO INSTANTANEAMENTE e retornar apenas o valor total final somado. Nunca use vírgula nem aspas para o valor.
3. conta: Deve ser rigorosamente "Loja" ou "Casa". Se o usuário não disser explicitamente, use o contexto para deduzir (ex: insumos de sorveteria, fretes e embalagens pertencem à Loja).
4. tipo: Deve ser rigorosamente "Receita" (para entradas, vendas, pix recebido) ou "Despesa" (para gastos, saídas, contas pagas).
5. categoria: Escolha estritamente uma destas opções: Alimentação, Mercado, Combustível, Loja, Sorvetes, Energia, Internet, Água, Aluguel, Salário, Pix, Outros.
6. descricao: Texto curto, profissional, limpo, corrigindo erros de digitação e com a primeira letra Maiúscula (máximo de 4 palavras).

Texto do usuário a ser analisado: "${textoUsuario}"

Retorne obrigatoriamente um objeto JSON puro com esta estrutura exata, sem blocos de texto adicionais:
{"data":"DD/MM/YYYY","conta":"Loja/Casa","tipo":"Receita/Despesa","categoria":"X","descricao":"X","valor":0.00}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const resposta = await axios.post(url, payload);

        if (!resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return { erro: true, mensagem: "O Google retornou uma estrutura vazia." };
        }

        const jsonTexto = resposta.data.candidates[0].content.parts[0].text.trim();
        const dados = JSON.parse(jsonTexto);
        
        return { erro: false, dados: dados };
    } catch (e) {
        const messageErroReal = e.response?.data?.error?.message || e.message;
        return { erro: true, mensagem: messageErroReal };
    }
}
