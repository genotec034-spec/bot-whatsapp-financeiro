const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const pino = require('pino');
const http = require('http');

// Configurações das Variáveis de Ambiente
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// Mini-servidor HTTP para enganar o Render e não deixar o bot cair
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Online\n');
}).listen(port, () => console.log(`Servidor na porta ${port}`));

async function ligarBot() {
    // Cria a pasta de sessão para salvar o login do WhatsApp
    const { state, saveCreds } = await useMultiFileAuthState('pasta_sessao');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true // Mostra o QR code nos Logs do Render
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("=== ESCANEIE O QR CODE ABAIXO ===");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const deveReconectar = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (deveReconectar) {
                console.log("Conexão caiu. Tentando reconectar...");
                ligarBot();
            }
        } else if (connection === 'open') {
            console.log("🚀 BOT CONECTADO COM SUCESSO NO WHATSAPP!");
        }
    });

    // Ouvir mensagens recebidas
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const deOnde = msg.key.remoteJid;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const nomeUsuario = msg.pushName || "Cliente";

        if (!texto) return;

        // Comandos Iniciais
        if (texto.toLowerCase() === 'oi' || texto === '/start') {
            await sock.sendMessage(deOnde, { text: `👋 Olá ${nomeUsuario}! Envie o seu lançamento que eu guardo na planilha.\n\nExemplo: Gastei 50 reais com mercado na conta Casa hoje` });
            return;
        }

        try {
            await sock.sendMessage(deOnde, { text: "🤖 Processando com Inteligência Artificial..." });

            // 1. Enviar para o Gemini interpretar
            const dadosPlanilha = await processarComGemini(texto);

            if (!dadosPlanilha || dadosPlanilha.erro) {
                await sock.sendMessage(deOnde, { text: "❌ Não entendi o formato. Envie o valor, a categoria e se foi na Loja ou Casa." });
                return;
            }

            // Adiciona o nome de quem enviou
            dadosPlanilha.usuario = nomeUsuario;

            // 2. Enviar os dados para a Planilha Google
            const respostaGoogle = await axios.post(APPS_SCRIPT_URL, dadosPlanilha);

            if (respostaGoogle.data === "OK") {
                const sucesso = `✅ Lançamento Salvo!\n\n📅 Data: ${dadosPlanilha.data}\n🏦 Conta: ${dadosPlanilha.conta}\n📊 Tipo: ${dadosPlanilha.tipo}\n🏷️ Categoria: ${dadosPlanilha.categoria}\n📝 Descrição: ${dadosPlanilha.descricao}\n💰 Valor: R$ ${Number(dadosPlanilha.valor).toFixed(2)}`;
                await sock.sendMessage(deOnde, { text: sucesso });
            } else {
                await sock.sendMessage(deOnde, { text: "⚠️ O Google respondeu, mas deu erro ao salvar." });
            }

        } catch (erro) {
            await sock.sendMessage(deOnde, { text: "❌ Erro no servidor: " + erro.message });
        }
    });
}

async function processarComGemini(textoUsuario) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const dataHoje = new Date().toISOString().split('T')[0];

        const prompt = `Transforme em JSON para o caixa da loja.\nTexto: "${textoUsuario}"\nData ref: ${dataHoje}\n\n` +
          `Contas: "Loja" ou "Casa". Tipos: "Receita" ou "Despesa".\n` +
          `Categorias: Alimentação, Mercado, Combustível, Loja, Sorvetes, Energia, Internet, Água, Aluguel, Salário, Pix, Outros.\n\n` +
          `Retorne APENAS o JSON puro, sem markdown:\n` +
          `{"data":"YYYY-MM-DD","conta":"Loja/Casa","tipo":"Receita/Despesa","categoria":"X","descricao":"X","valor":0.00}`;

        const resposta = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });
        let jsonTexto = resposta.data.candidates[0].content.parts[0].text.trim();
        jsonTexto = jsonTexto.replace(/```json|```/g, "").trim();
        return JSON.parse(jsonTexto);
    } catch (e) {
        return { erro: true };
    }
}

ligarBot();
