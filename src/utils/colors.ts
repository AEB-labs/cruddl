import style from 'ansi-styles';
import { EscapeCode } from 'ansi-styles/escape-code';
import CodePair = EscapeCode.CodePair;

// we can neither use colors nor chalk because they import node-specific modules which would not work in a pure
// webpack environment

namespace colors {
    export let enabled = false;
}
export default colors;

function applyColorFn(color: CodePair) {
    return (str: string) => (colors.enabled ? color.open + str + color.close : str);
}

export const cyan = applyColorFn(style.color.cyan);
export const magenta = applyColorFn(style.color.magenta);
export const green = applyColorFn(style.color.green);
export const grey = applyColorFn(style.color.grey);
export const yellow = applyColorFn(style.color.yellow);
export const red = applyColorFn(style.color.red);
export const blue = applyColorFn(style.color.blue);
export const bold = applyColorFn(style.bold);
