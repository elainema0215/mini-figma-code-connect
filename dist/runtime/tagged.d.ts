import type { ResultSection } from './types';
export type Interpolable = ResultSection[] | string | number | boolean | null | undefined;
export declare function code(strings: TemplateStringsArray, ...values: Interpolable[]): ResultSection[];
/** 真实 CC 里这些只影响语法高亮，运行时行为完全一致 */
export declare const tsx: typeof code;
export declare const html: typeof code;
