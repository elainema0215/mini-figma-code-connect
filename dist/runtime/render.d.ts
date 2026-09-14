import type { ResultSection } from './types';
/** 去掉模板字面量带来的公共缩进 */
export declare function dedent(text: string): string;
/** ResultSection[] → 给人看的字符串。真正的消费端（Dev Mode / MCP）拿的是数组本身 */
export declare function renderToString(sections: ResultSection[]): string;
export declare function collectErrors(sections: ResultSection[]): string[];
