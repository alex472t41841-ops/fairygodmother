// netlify/functions/analyze-photo.js
//
// 用途：代購拍照現場建單時，把商品照片丟給這支函式，由 Gemini 的圖片辨識能力
// 自動判斷商品名稱與賣點描述，減少現場手動打字的時間。
//
// 部署方式：
// 1. 放到跟你現有 generate-copy.js 同一個資料夾（通常是 netlify/functions/）
// 2. 檔名就叫 analyze-photo.js
// 3. 不需要另外設定新的環境變數 —— 沿用你已經設定好的 GEMINI_API_KEY
// 4. git push（或你原本部署 Netlify 的方式）讓 Netlify 重新部署即可

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // 瀏覽器 CORS 預檢請求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { image, mimeType } = JSON.parse(event.body || '{}');

    if (!image) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '缺少圖片資料' }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY 未設定，請至 Netlify 環境變數確認' }) };
    }

    const prompt = `你是代購商品上架助手。請仔細看這張商品照片（可能是包裝、標籤、或賣場現場拍攝的畫面），用繁體中文回答。

請「只」輸出以下 JSON 格式的內容，不要加上 Markdown 符號（例如三個反引號）、不要加上任何其他說明文字：

{"name":"商品品牌＋品名，盡量精簡，若照片上看得到容量/尺寸等規格也一併帶入","desc":"2到3句話的商品賣點描述，語氣自然、適合用於代購社群貼文吸引買家"}

如果照片內容完全無法辨識出具體商品，name 請填「請手動輸入商品名稱」，desc 請填空字串。`;

    const model = 'gemini-2.5-flash';
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
              ]
            }
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
        })
      }
    );

    const geminiData = await geminiResp.json();

    if (!geminiResp.ok) {
      console.error('Gemini API error', JSON.stringify(geminiData));
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI 服務回應錯誤，請稍後再試' }) };
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // 有時模型還是會加上 ```json 這種 code fence，先清掉
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('無法解析 AI 回應為 JSON，原始內容：', rawText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI 回應格式異常，請重新拍照再試一次' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ name: parsed.name || '', desc: parsed.desc || '' })
    };
  } catch (err) {
    console.error('analyze-photo function error', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || '未知錯誤' }) };
  }
};
