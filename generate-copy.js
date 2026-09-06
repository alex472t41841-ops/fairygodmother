// netlify/functions/generate-copy.js
//
// 這支程式「不是」跑在使用者的瀏覽器裡，是跑在 Netlify 的伺服器上。
// GEMINI_API_KEY 只存在 Netlify 後台的環境變數裡，永遠不會出現在你的網頁原始碼中，
// 這樣才不會被任何打開你網站原始碼的人看到、盜用你的金鑰額度。
//
// 你的正式網站還是繼續放在 GitHub Pages，這支函式單獨放在 Netlify，
// 所以網頁呼叫這支函式時是「跨網域」請求，底下有加上 CORS 允許標頭。
// 如果之後改了網站網域，記得把下面 ALLOWED_ORIGIN 也一起改掉。
const ALLOWED_ORIGIN = 'https://alex472t41841-ops.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

exports.handler = async function (event) {
  // 瀏覽器在送出跨網域 POST 前，會先送一個 OPTIONS 請求來「問路」，這裡要正確回應
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  // 只接受 POST 請求
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: '尚未設定 GEMINI_API_KEY，請到 Netlify 後台的 Environment variables 設定。' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: '請求格式錯誤' }) };
  }

  const name = (payload.name || '商品').toString().slice(0, 200);
  const desc = (payload.desc || '').toString().slice(0, 2000);
  const price = (payload.price || '0').toString().slice(0, 50);
  const deadlineStr = (payload.deadlineStr || '').toString().slice(0, 100);

  if (!desc.trim()) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: '請提供商品描述' }) };
  }

  const prompt = `你是台灣一位私群團購代購主，正在幫自己的商品寫一段要貼在 LINE / Facebook 社團的行銷文案。

商品名稱：${name}
商品描述／核心賣點：${desc}
售價：新台幣 ${price} 元
${deadlineStr ? '截止收單時間：' + deadlineStr : ''}

請直接輸出一段繁體中文、口吻熱情親切、適合台灣代購社群的行銷文案，長度約 120-200 字。
內容需包含：吸引人的開頭、根據上述賣點的介紹、售價、${deadlineStr ? '截止時間、' : ''}以及提醒大家在留言處登記「姓名 + 規格 + 數量」。
最後加上 1-2 個相關的中文 hashtag（例如 #代購）。
只要輸出文案本身，不要加上任何說明文字、不要用引號包住整段文字。`;

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Gemini API error', data);
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'AI 服務回應失敗：' + (data.error?.message || resp.statusText) })
      };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: 'AI 沒有回傳可用的文案內容，請再試一次。' }) };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: '呼叫 AI 服務時發生錯誤：' + e.message }) };
  }
};
