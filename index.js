const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Configurações das Variáveis de Ambiente
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// Servidor HTTP obrigatório para o Render manter o bot vivo
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Telegram Bot Online\n');
}).listen(port, () => console.log(`Servidor rodando na porta ${port}`));

// Inicializa o bot do Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log("🚀 BOT DO TELEGRAM INICIADO COM SUCESSO!");

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    const nomeUsuario = msg.from.first_name || "Usuário";

    if (!texto) return;

    // Comandos Iniciais
    if (texto.toLowerCase() === '/start' || texto.toLowerCase() === 'oi') {
        bot.sendMessage(chatId, `👋 Olá ${nomeUsuario}! Envie o seu lançamento que eu guardo na planilha.\n\n📝 *Exemplo:* Gastei 50 reais com mercado na conta Casa hoje`, { parse_mode: 'Markdown' });
        return;
    }

    try {
        bot.sendMessage(chatId, "🤖 Processando com Inteligência Artificial...");

        // 1. Enviar para o Gemini interpretar
        const resultadoGemini = await processarComGemini(texto);

        // Se a IA falhar, ela vai trazer o motivo real para o Telegram
        if (resultadoGemini.erro) {
            bot.sendMessage(chatId, `❌ Erro na IA:\n\`${resultadoGemini.mensagem}\``, { parse_mode: 'Markdown' });
            return;
        }

        const dadosPlanilha = resultadoGemini.dados;
        dadosPlanilha.usuario = nomeUsuario;

        // 2. Enviar os dados para a Planilha Google
        const respostaGoogle = await axios.post(APPS_SCRIPT_URL, dadosPlanilha);

        if (respostaGoogle.data === "OK") {
            const sucesso = `✅ *Lançamento Salvo!*\n\n📅 *Data:* ${dadosPlanilha.data}\n🏦 *Conta:* ${dadosPlanilha.conta}\n📊 *Tipo:* ${dadosPlanilha.tipo}\n🏷️ *Categoria:* ${dadosPlanilha.categoria}\n📝 *Descrição:* ${dadosPlanilha.descricao}\n💰 *Valor:* R$ ${Number(dadosPlanilha.valor).toFixed(2)}`;
            bot.sendMessage(chatId, sucesso, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `⚠️ O script do Google respondeu, mas não retornou OK. Resposta: ${respostaGoogle.data}`);
        }

    } catch (erro) {
        bot.sendMessage(chatId, "❌ Erro interno no servidor do bot: " + erro.message);
    }
});

// Função com diagnóstico detalhado de erros
async function processarComGemini(textoUsuario) {
    try {
        // Atualizado para a versão estável do modelo 2.5
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const dataHoje = new Date().toISOString().split('T')[0];

        const prompt = `Transforme o texto de gastos/receitas do usuário em um objeto JSON organizado.\n` +
          `Texto do usuário: "${textoUsuario}"\n` +
          `Data de referência para hoje: ${dataHoje}\n\n` +
          `Regras para os campos:\n` +
          `- conta: obrigatoriamente "Loja" ou "Casa".\n` +
          `- tipo: obrigatoriamente "Receita" ou "Despesa".\n` +
          `- categoria: classifique estritamente como uma destas: Alimentação, Mercado, Combustível, Loja, Sorvetes, Energia, Internet, Água, Aluguel, Salário, Pix, Outros.\n` +
          `- descricao: breve resumo do lançamento.\n` +
          `- valor: número decimal puro.\n\n` +
          `Siga exatamente esta estrutura:\n` +
          `{"data":"YYYY-MM-DD","conta":"Loja/Casa","tipo":"Receita/Despesa","categoria":"X","descricao":"X","valor":0.00}`;

        const resposta = await axios.post(url, { 
            contents: [{ parts: [{ text: prompt }] }]
        });

        if (!resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return { erro: true, mensagem: "O Google retornou uma estrutura vazia ou bloqueada por segurança." };
        }

        let jsonTexto = resposta.data.candidates[0].content.parts[0].text.trim();
        
        // Captura o JSON de forma isolada
        const inicioJson = jsonTexto.indexOf('{');
        const fimJson = jsonTexto.lastIndexOf('}');
        
        if (inicioJson !== -1 && fimJson !== -1) {
            jsonTexto = jsonTexto.substring(inicioJson, fimJson + 1);
            const dados = JSON.parse(jsonTexto);
            return { erro: false, dados: dados };
        } else {
            return { erro: true, mensagem: `O formato retornado não contém JSON válido: ${jsonTexto}` };
        }
    } catch (e) {
        // Captura a mensagem real de erro enviada pelo servidor do Google
        const mensagemErroReal = e.response?.data?.error?.message || e.message;
        console.error("❌ Erro na chamada do Gemini:", mensagemErroReal);
        return { erro: true, mensagem: mensagemErroReal };
    }
}
