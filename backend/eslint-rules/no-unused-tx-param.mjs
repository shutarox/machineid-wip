/**
 * `tx` を引数に取りながら一度も使っていない関数を禁止する。
 *
 * このリポジトリの層構造は「route → tx を受け取るモデル関数 → 純粋関数」で、
 * 純粋関数は DB に触らないぶん tx を受け取らない。使われていない `tx` は
 * 層の取り違え(純粋関数のはずが tx を受け取っている / 実装を消したあとに
 * 引数だけ残っている)のサインなので error にする。
 *
 * @typescript-eslint/no-unused-vars は既定が `args: 'after-used'` のため、
 * 後ろに使用済みの引数があると先頭の未使用 `tx` を報告しない。そこを埋める。
 */

/** @type {import('eslint').Rule.RuleModule} */
export const noUnusedTxParam = {
  meta: {
    type: 'problem',
    docs: {
      description:
        '使用されていない tx 引数を禁止する(純粋関数は tx を受け取らない)',
    },
    schema: [],
    messages: {
      unusedTx:
        '引数 `{{name}}` が使われていません。純粋関数は tx を受け取らないこと(層の取り違えの可能性があります)。',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** 引数の中から tx 系の Identifier を集める(分割代入やデフォルト値も辿る) */
    const collectTxIdentifiers = (param, found) => {
      if (!param) return found;
      switch (param.type) {
        case 'Identifier':
          if (param.name === 'tx') found.push(param);
          break;
        case 'AssignmentPattern':
          collectTxIdentifiers(param.left, found);
          break;
        case 'RestElement':
          collectTxIdentifiers(param.argument, found);
          break;
        case 'ObjectPattern':
          for (const prop of param.properties) {
            collectTxIdentifiers(
              prop.type === 'Property' ? prop.value : prop.argument,
              found
            );
          }
          break;
        case 'ArrayPattern':
          for (const element of param.elements) {
            collectTxIdentifiers(element, found);
          }
          break;
        default:
          break;
      }
      return found;
    };

    const check = (node) => {
      const txParams = [];
      for (const param of node.params) {
        collectTxIdentifiers(param, txParams);
      }
      if (txParams.length === 0) return;

      const scope = sourceCode.getScope(node);
      for (const identifier of txParams) {
        const variable = scope.variables.find((v) => v.name === identifier.name);
        // 参照が 1 つも無い = 受け取っただけで使っていない
        if (variable && variable.references.length === 0) {
          context.report({
            node: identifier,
            messageId: 'unusedTx',
            data: { name: identifier.name },
          });
        }
      }
    };

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
