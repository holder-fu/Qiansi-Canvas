export type TextEditActivation = {
  button: number;
  detail: number;
};

export function shouldEnterTextNodeEdit(event: TextEditActivation) {
  return event.button === 0 && event.detail >= 2;
}
