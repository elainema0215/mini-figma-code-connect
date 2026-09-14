type Level = 'error' | 'warn';
type Finding = {
    level: Level;
    text: string;
};
type PropertyDef = {
    name: string;
    type: string;
    variantOptions?: string[];
};
type Schema = {
    componentId: string;
    componentKey: string;
    componentName: string;
    properties: PropertyDef[];
};
type AccessorCall = {
    depth: number;
    prop: string;
    method: string;
    ok: boolean;
    note?: string;
};
type Candidate = {
    id: string;
    name: string;
    mapped: boolean;
};
type Msg = {
    type: 'state';
    state: 'empty' | 'unmapped' | 'error';
    message: string;
    schema?: Schema;
    figmaUrl?: string | null;
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
    groups: {
        componentKey: string;
        componentName: string;
        count: number;
        sampleNodeId: string;
        mapped: boolean;
        codeComponent: string | null;
    }[];
} | {
    type: 'state';
    state: 'ok';
    schema: Schema;
    template: {
        id: string;
        meta: {
            url: string;
            source: string;
            component: string;
        };
    };
    snippet: string;
    imports: string[];
    findings: Finding[];
    calls: AccessorCall[];
    candidates?: Candidate[];
} | {
    type: 'download';
    filename: string;
    json: string;
};
declare const body: HTMLElement;
declare const send: (type: string, extra?: Record<string, unknown>) => void;
declare const esc: (s: string) => string;
declare function schemaTable(schema: Schema, calls: AccessorCall[]): string;
declare function backBar(candidates?: Candidate[]): string;
declare function wireBack(): void;
declare const exportSchemaBtn: HTMLButtonElement;
declare let inCandidatesMode: boolean;
declare function syncExportButton(state: string, count: number): void;
declare function render(msg: Msg): void;
