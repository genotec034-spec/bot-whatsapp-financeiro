async function processarComGemini(textoUsuario) {
    try {
        // Mudamos para v1beta para aceitar o gemini-2.5-flash e a entrega em JSON estável
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        // Pega a data de hoje no fuso horário do Brasil (DD/MM/YYYY)
        const dataHojeBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const prompt = `Você é um contador e analista financeiro sênior. Sua tarefa é extrair os dados do texto do usuário e formatá-los em um JSON perfeito.
        
Data de hoje como referência: ${dataHojeBR}

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
1. data: Deve ser estritamente no formato brasileiro DD/MM/YYYY. Se o usuário falar "ontem", calcule a data de ontem baseado em hoje e converta para DD/MM/YYYY.
2. valor: Deve ser um número decimal puro (ex: 35.00). SE O USUÁRIO ENVIAR UMA SOMA OU CÁLCULO (ex: "12 + 15", "10 reais e mais 5"), VOCÊ DEVE FAZER O CÁLCULO INSTANTANEAMENTE e retornar apenas o valor total somado.
3. conta: "Loja" ou "Casa". Se o usuário não especificar, deduza pelo contexto.
4. tipo: "Receita" ou "Despesa".
5. categoria: Escolha estritamente entre: Alimentação, Mercado, Combustível, Loja, Sorvetes, Energia, Internet, Água, Aluguel, Salário, Pix, Outros.
6. descricao: Texto curto, limpo, com a primeira letra Maiúscula (máximo 4 palavras).

Texto do usuário: "${textoUsuario}"

Retorne obrigatoriamente um objeto JSON com esta estrutura exata:
{"data":"DD/MM/YYYY","conta":"Loja/Casa","tipo":"Receita/Despesa","categoria":"X","descricao":"X","valor":0.00}`;

        // Correção do padrão exigido pelo Google: generationConfig e responseMimeType sem subtraços
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
        console.error("Erro detalhado na chamada do Gemini:", e.response?.data || e.message);
        return { erro: true, message: mensagemErroReal };
    }
}
