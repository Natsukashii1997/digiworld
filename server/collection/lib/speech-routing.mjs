// A nonempty system transcript is not evidence of correct language recognition.
// Prefer the multilingual model; retain a visible warning when falling back.
export async function analyzeSpeech({multilingual, system, legacy}) {
  try {
    return await multilingual();
  } catch {
    const warning = '多语言识别未成功，已改用系统识别，文稿需要核对';
    let lastError;
    for (const analyze of [system, legacy]) {
      try {
        const result = await analyze();
        if (result.transcriptSegments?.some(segment => segment.text?.trim())) {
          return {...result, speechError:[warning, result.speechError].filter(Boolean).join('；')};
        }
        lastError = result.speechError;
      } catch (error) {
        lastError = error.message;
      }
    }
    throw new Error(['多语言及系统语音识别均未成功', lastError].filter(Boolean).join('；'));
  }
}
