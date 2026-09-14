import type { AccessorCall, ComponentSchema } from '../runtime/types';
export type Finding = {
    level: 'error' | 'warn';
    text: string;
};
/**
 * Step 6 的自动化版本。
 *
 * 思路：不让模板重复声明它消费了什么，而是在 render 期间记录每一次 accessor 调用，
 * 事后拿这份调用记录和 schema 对账。「穷举缺失」和「属性未映射」就都能被机器发现。
 *
 * @param calls    真实一遍 render 的调用记录 —— 用来报错
 * @param coverage 探测一遍（所有 boolean 视为 true）的调用记录 —— 用来算覆盖率，
 *                 避免条件分支里的属性被误报成未映射
 */
export declare function validate(schema: ComponentSchema, calls: AccessorCall[], coverage?: AccessorCall[]): Finding[];
