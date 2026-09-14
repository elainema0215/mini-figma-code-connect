import type { Template } from './types';
import { templates } from './registry.generated';
export { templates };
/** 先按 componentKey 精确匹配（绑定过的），再退回组件名 */
export declare function lookup(componentKey: string, componentName: string): Template | null;
