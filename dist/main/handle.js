import { lookup } from '../runtime/registry';
export class ErrorHandle {
    constructor(message) {
        this.message = message;
        this.type = 'ERROR';
    }
}
class TextHandle {
    constructor(node) {
        this.node = node;
        this.type = 'TEXT';
    }
    get name() {
        return this.node.name;
    }
    get textContent() {
        return this.node.characters;
    }
}
export class InstanceHandle {
    constructor(node, ctx) {
        this.node = node;
        this.ctx = ctx;
        this.type = 'INSTANCE';
    }
    get name() {
        return this.node.name;
    }
    // ── 属性查找：key 带 "#id" 后缀，按显示名找回来 ──
    entryKey(prop) {
        const props = this.node.componentProperties;
        if (Object.prototype.hasOwnProperty.call(props, prop))
            return prop;
        return Object.keys(props).find((k) => k.split('#')[0] === prop);
    }
    /** 保留 type —— 否则 getString 之类无法察觉自己读错了属性类型 */
    entry(prop) {
        const k = this.entryKey(prop);
        if (k === undefined)
            return undefined;
        return this.node.componentProperties[k];
    }
    log(c) {
        this.ctx.calls.push({ ...c, depth: this.ctx.depth });
    }
    getString(prop) {
        const e = this.entry(prop);
        if (!e) {
            this.log({ prop, method: 'getString', ok: false, note: '属性不存在' });
            return '';
        }
        if (e.type === 'INSTANCE_SWAP') {
            // INSTANCE_SWAP 的 value 是个节点 id，直接当字符串吐进代码里毫无意义
            this.log({
                prop,
                method: 'getString',
                ok: false,
                note: '这是 INSTANCE_SWAP 属性，应该用 getInstanceSwap()',
            });
            return '';
        }
        this.log({ prop, method: 'getString', ok: true });
        return String(e.value);
    }
    getBoolean(prop, mapping) {
        const e = this.entry(prop);
        if (!e) {
            this.log({ prop, method: 'getBoolean', ok: false, note: '属性不存在' });
            return mapping ? mapping.false : false;
        }
        // 布尔常被做成 VARIANT，选项写作 "True"/"False"（Figma UI 的默认命名），
        // 所以必须大小写不敏感，否则 Disabled 永远读成 false
        const v = this.ctx.probe ? true : e.value === true || String(e.value).toLowerCase() === 'true';
        this.log({ prop, method: 'getBoolean', ok: true });
        return mapping ? (v ? mapping.true : mapping.false) : v;
    }
    /** 字典查表。命中不了就返回 undefined —— 跟真实 CC 一样静默，靠 validate() 事后揪出来 */
    getEnum(prop, mapping) {
        const keys = Object.keys(mapping);
        const e = this.entry(prop);
        if (!e) {
            this.log({ prop, method: 'getEnum', mappingKeys: keys, ok: false, note: '属性不存在' });
            return undefined;
        }
        const raw = String(e.value);
        const hit = Object.prototype.hasOwnProperty.call(mapping, raw);
        this.log({
            prop,
            method: 'getEnum',
            mappingKeys: keys,
            ok: hit,
            note: hit ? undefined : `当前值 "${raw}" 不在字典里，返回了 undefined`,
        });
        return hit ? mapping[raw] : undefined;
    }
    /** 绑插槽而不是绑图层名：找到把 mainComponent 绑在这个属性上的后代实例 */
    getInstanceSwap(prop) {
        const key = this.entryKey(prop);
        if (key === undefined) {
            this.log({ prop, method: 'getInstanceSwap', ok: false, note: '属性不存在' });
            return null;
        }
        const hit = this.node.findOne((n) => {
            if (n.type !== 'INSTANCE')
                return false;
            const refs = n.componentPropertyReferences;
            return !!refs && refs.mainComponent === key;
        });
        if (!hit) {
            this.log({ prop, method: 'getInstanceSwap', ok: false, note: '找不到绑定该属性的子实例' });
            return new ErrorHandle(`找不到 instance swap 插槽 "${prop}"`);
        }
        this.log({ prop, method: 'getInstanceSwap', ok: true });
        return new InstanceHandle(hit, this.ctx);
    }
    findInstance(layerName) {
        const hit = this.node.findOne((n) => n.type === 'INSTANCE' && n.name === layerName);
        return hit ? new InstanceHandle(hit, this.ctx) : new ErrorHandle(`找不到图层 "${layerName}"`);
    }
    findText(layerName) {
        const hit = this.node.findOne((n) => n.type === 'TEXT' && n.name === layerName);
        return hit ? new TextHandle(hit) : new ErrorHandle(`找不到文本图层 "${layerName}"`);
    }
    template() {
        const ref = this.ctx.mainByNode.get(this.node.id);
        return ref ? lookup(ref.key, ref.name) : null;
    }
    hasCodeConnect() {
        return this.template() !== null;
    }
    codeConnectId() {
        const t = this.template();
        return t ? t.id : null;
    }
    /** 递归求值：子模板的输出直接插进父模板的字面量 */
    executeTemplate() {
        const ref = this.ctx.mainByNode.get(this.node.id);
        if (this.ctx.depth > 8) {
            return { example: [{ type: 'ERROR', message: '嵌套层级过深，已截断' }], id: 'depth-limit' };
        }
        const t = this.template();
        if (!t) {
            // 没有映射 → 返回 INSTANCE 段，保留实例身份（真实 CC 在这里渲染成 pill）
            return {
                example: [
                    {
                        type: 'INSTANCE',
                        guid: this.node.id,
                        symbolId: ref ? ref.id : '',
                        name: ref ? ref.name : this.node.name,
                    },
                ],
                id: 'unmapped',
            };
        }
        const child = new InstanceHandle(this.node, { ...this.ctx, depth: this.ctx.depth + 1 });
        try {
            return t.render(child);
        }
        catch (err) {
            return {
                example: [{ type: 'ERROR', message: `模板 ${t.id} 执行失败: ${String(err)}` }],
                id: t.id,
            };
        }
    }
}
