async function processarComGemini(textoUsuario) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        // Pega a data de hoje já no fuso horário do Brasil e formato DD/MM/YYYY
        const dataHojeBR = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const prompt = `Você é um contador e analista financeiro sênior. Transforme o texto de gastos/receitas em um objeto JSON perfeito.
        
Data de hoje como referência: ${dataHojeBR}

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
1. data: Deve ser estritamente no formato brasileiro DD/MM/YYYY. Se o usuário falar "ontem" ou outra data, calcule e converta para DD/MM/YYYY.
2. valor: Deve ser um número decimal puro (ex: 35.00). SE O USUÁRIO ENVIAR UMA SOMA OU CÁLCULO (ex: "12 + 15", "10 reais e mais 5", "30 + 25 de polpa"), VOCÊ DEVE FAZER O CÁLCULO INSTANTANEAMENTE e retornar apenas o valor total somado.
3. conta: "Loja" ou "Casa".
4. tipo: "Receita" ou "Despesa".
5. categoria: Escolha estritamente entre: Alimentação, Mercado, Combustível, Loja, Sorvetes, Energia, Internet, Água, Aluguel, Salário, Pix, Outros.
6. descricao: Texto curto, limpo, com a primeira letra Maiúscula.

Texto do usuário: "${textoUsuario}"

Retorne APENAS o JSON puro nesta estrutura:
{"data":"DD/MM/YYYY","conta":"Loja/Casa","tipo":"Receita/Despesa","categoria":"X","descricao":"X","valor":0.00}`;

        const resposta = await axios.post(url, { 
            contents: [{ parts: [{ text: prompt }] }]
        });

        if (!resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return { erro: true, mensagem: "O Google retornou uma estrutura vazia." };
        }

        let jsonTexto = resposta.data.candidates[0].content.parts[0].text.trim();
        
        const inicioJson = jsonTexto.indexOf('{');
        const fimJson = jsonTexto.lastIndexOf('}');
        
        if (inicioJson !== -1 && fimJson !== -1) {
            jsonTexto = jsonTexto.substring(inicioJson, fimJson + 1);
            const dados = JSON.parse(jsonTexto);
            return { erro: false, dados: dados };
        } else {
            return { erro: true, mensagem: "JSON não localizado na resposta." };
        }
    } catch (e) {
        const mensagemErroReal = e.response?.data?.error?.message || e.message;
        return { erro: true, message: mensagemErroReal };
    }
}
