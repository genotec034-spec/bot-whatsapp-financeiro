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

        if (resultadoGemini.erro) {
            bot.sendMessage(chatId, `❌ Erro na IA:\n\`${resultadoGemini.mensagem}\``, { parse_mode: 'Markdown' });
            return;
        }

        const dadosPlanilha = resultadoGemini.dados;
        dadosPlanilha.usuario = nomeUsuario;

        // 🔥 LINHA MÁGICA: Garante que o valor seja enviado como NÚMERO PURO (remove aspas de texto)
        if (dadosPlanilha.valor) {
            dadosPlanilha.valor = Number(dadosPlanilha.valor);
        }

        // 2. Enviar os dados para a Planilha Google usando FETCH nativo
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
            bot.sendMessage(chatId, `⚠️ O script do Google respondeu, mas não retornou OK. Resposta: ${textoResposta}`);
        }

    } catch (erro) {
        bot.sendMessage(chatId, "❌ Erro interno no servidor do bot: " + erro.message);
    }
});

// Função do Gemini ajustada com o modelo 2.5 e parâmetros estáveis
async function processarComGemini(textoUsuario) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const dataHojeBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const prompt = `Você é um contador e analista financeiro sênior. Sua tarefa é extrair os dados do texto do usuário e formatá-los em um JSON perfeito.
        
Data de hoje como referência: ${dataHojeBR}

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
1. data: Deve ser estritamente no formato brasileiro DD/MM/YYYY. Se o usuário falar "ontem", calcule a data de ontem baseado em hoje e converta para DD/MM/YYYY.
2. valor: Deve ser um número decimal puro (ex: 35.00). SE O USUÁRIO ENVIAR UMA SOMA OU CÁLCULO, FAÇA O CÁLCULO INSTANTANEAMENTE e retorne apenas o valor total somado. Não coloque aspas no valor.
3. conta: "Loja" ou "Casa". Se o usuário não especificar, deduza pelo contexto.
4. tipo: "Receita" ou "Despesa".
5. categoria: Escolha estritamente entre: Alimentação, Mercado, Combustível, Loja, Sorvetes, Energia, Internet, Água, Aluguel, Salário, Pix, Outros.
6. descricao: Texto curto, limpo, com a primeira letra Maiúscula (máximo 4 palavras).

Texto do usuário: "${textoUsuario}"

Retorne obrigatoriamente um objeto JSON com esta estrutura exata:
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
        const mensagemErroReal = e.response?.data?.error?.message || e.message;
        return { erro: true, mensagem: mensagemErroReal };
    }
}
