/**
 * 迷你 Code Connect 运行时的类型定义。
 *
 * 关键一点，也是整套实现的地基：模板的输出不是字符串，而是 ResultSection[]。
 * 这样才能在拼装时保留实例身份、并让错误就地降级而不是拖垮整段 snippet。
 */
export {};
