// netlify/functions/generate-copy.js
//
// 用途：依商品名稱、描述、價格、截止時間，生成適合貼到 LINE/社群的代購行銷文案。
// 前端 generateAICopy() 會送出 { name, desc, price, deadlineStr }，
// 並預期收到 { text: "生成的文案內容" }。

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { name, desc, price, deadlineStr } = JSON.parse(event.body || '{}');

    if (!desc) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '缺少商品描述' }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY 未設定，請至 Netlify 環境變數確認' }) };
    }

    const prompt = `你是「Fairy godmother代購」的社群小編，請根據以下商品資訊，寫一則要貼到 LINE 群組/社群的代購貼文文案，用繁體中文，語氣自然、親切、有點小興奮感，適度使用表情符號但不要過多。

商品名稱：${name || '商品'}
商品描述／賣點：${desc}
售價：NT$ ${price || '0'}
${deadlineStr ? '截止時間：' + deadlineStr : ''}

文案需包含：
1. 一個吸引人的開頭（可以用商品名稱＋表情符號）
2. 用 1~2 句話講出這個商品的賣點，語氣自然不要像廣告詞
3. 清楚列出售價${deadlineStr ? '與截止時間' : ''}
4. 提醒有需要的人在留言處登記，並給出登記格式範例「姓名 + 規格 + 數量」
5. 結尾加上「Fairy godmother代購」和 1~2 個 # 標籤

請「只」輸出文案本身的純文字內容，不要加上任何說明文字或 Markdown 符號。`;

    const model = 'gemini-2.5-flash';
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 500 }
        })
      }
    );

    const geminiData = await geminiResp.json();

    if (!geminiResp.ok) {
      console.error('Gemini API error', JSON.stringify(geminiData));
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI 服務回應錯誤，請稍後再試' }) };
    }

    const text = (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!text) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI 沒有回傳內容，請稍後再試' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    console.error('generate-copy function error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || '未知錯誤' }) };
  }
};
