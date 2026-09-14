import type { AccessorCall, ComponentSchema, ResultSection, TemplateMeta } from '../runtime/types';
import type { Finding } from './validate';
type Candidate = {
    id: string;
    name: string;
    mapped: boolean;
};
export type UnmappedGroup = {
    componentKey: string;
    componentName: string;
    count: number;
    sampleNodeId: string;
    mapped: boolean;
    codeComponent: string | null;
};
export type ToUi = {
    type: 'state';
    state: 'empty' | 'unmapped' | 'error';
    message: string;
    schema?: ComponentSchema;
    /** 该实例在 Figma 里的完整节点地址，拿不到 figma.fileKey 时为 null；仅 unmapped 用得上 */
    figmaUrl?: string | null;
    /** 上一次「一个容器里多个实例」的候选名单，供面板画「返回列表」 */
    candidates?: Candidate[];
} | {
    type: 'state';
    state: 'candidates';
    message: string;
    candidates: Candidate[];
} | {
    type: 'state';
    state: 'scan';
    message: string;
    groups: UnmappedGroup[];
} | {
    type: 'state';
    state: 'ok';
    message: '';
    schema: ComponentSchema;
    template: {
        id: string;
        meta: TemplateMeta;
    };
    snippet: string;
    imports: string[];
    sections: ResultSection[];
    findings: Finding[];
    calls: AccessorCall[];
    candidates?: Candidate[];
} | {
    type: 'download';
    filename: string;
    json: string;
};
export type FromUi = {
    type: 'refresh';
} | {
    type: 'pick';
    id: string;
} | {
    type: 'backToList';
} | {
    type: 'exportSchema';
} | {
    type: 'scan';
} | {
    type: 'exportAllSchemas';
} | {
    type: 'exportMappingTable';
};
export {};
