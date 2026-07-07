const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Telegram Bot Online\n');
}).listen(port, () => console.log(`Servidor rodando na porta ${port}`));

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const texto = msg.text;
    const nomeUsuario = msg.from.first_name || "Usuário";

    if (!texto) return;

    if (texto.toLowerCase() === '/start' || texto.toLowerCase() === 'oi') {
        bot.sendMessage(chatId, `👋 Olá ${nomeUsuario}! Já estou pronto.\n\n📊 *Comandos úteis:*\n/planilha - Link da tabela\n/total - Ver total de despesas acumuladas`, { parse_mode: 'Markdown' });
        return;
    }

    if (texto.toLowerCase() === '/planilha') {
        bot.sendMessage(chatId, `📊 *Link da sua Planilha de Lançamentos:*\n\n[Clique aqui para abrir a Planilha](${APPS_SCRIPT_URL})`, { parse_mode: 'Markdown' });
        return;
    }

    // 🔥 NOVO COMANDO: Solicita o cálculo do total para o Google
    if (texto.toLowerCase() === '/total') {
        try {
            bot.sendMessage(chatId, "🧮 A calcular a soma das despesas na planilha...");
            const respostaGoogle = await fetch(APPS_SCRIPT_URL);
            const totalAcumulado = await respostaGoogle.text();
            
            bot.sendMessage(chatId, `💰 *Total de Despesas Acumulado:* R$ ${Number(totalAcumulado).toFixed(2)}`, { parse_mode: 'Markdown' });
        } catch (erro) {
            bot.sendMessage(chatId, "❌ Erro ao ler dados da planilha: " + erro.message);
        }
        return;
    }

    // Processamento de texto normal com o Gemini
    try {
        bot.sendMessage(chatId, "🤖 Processando com Inteligência Artificial...");
        const resultadoGemini = await processarComGemini(texto);

        if (resultadoGemini.erro) {
            bot.sendMessage(chatId, `❌ Erro na IA: \`${resultadoGemini.mensagem}\``, { parse_mode: 'Markdown' });
            return;
        }

        const dadosPlanilha = resultadoGemini.dados;
        dadosPlanilha.usuario = nomeUsuario;

        if (dadosPlanilha.valor) {
            dadosPlanilha.valor = Number(dadosPlanilha.valor);
        }

        const respostaGoogle = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosPlanilha)
        });

        const textoResposta = await respostaGoogle.text();

        if (textoResposta.trim() === "OK") {
            const sucesso = `✅ *Lançamento Salvo!*\n\n📅 *Data:* ${dadosPlanilha.data}\n🏦 *Conta:* ${dadosPlanilha.conta}\n📊 *Tipo:* ${dadosPlanilha.tipo}\n🏷️ *Categoria:* ${dadosPlanilha.categoria}\n📝 *Descrição:* ${dadosPlanilha.descricao}\n💰 *Valor:* R$ ${Number(dadosPlanilha.valor).toFixed(2)}`;
            bot.sendMessage(chatId, sucesso, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `⚠️ Erro na planilha: ${textoResposta}`);
        }

    } catch (erro) {
        bot.sendMessage(chatId, "❌ Erro no servidor: " + erro.message);
    }
});

async function processarComGemini(textoUsuario) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const dataHojeBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const prompt = `Você é um contador sénior. Extraia os dados e formate em JSON.\nData de hoje: ${dataHojeBR}\nTexto: "${textoUsuario}"\nRetorne apenas o JSON:\n{"data":"DD/MM/YYYY","conta":"Loja/Casa","tipo":"Receita/Despesa","categoria":"X","descricao":"X","valor":0.00}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        };

        const resposta = await axios.post(url, payload);
        const jsonTexto = resposta.data.candidates[0].content.parts[0].text.trim();
        return { erro: false, dados: JSON.parse(jsonTexto) };
    } catch (e) {
        return { erro: true, mensagem: e.message };
    }
}
