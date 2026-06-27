# 16-jsdoc-gen — JSDoc → Markdown API ドキュメント生成

ソースファイルを再帰スキャンして `/** */` JSDoc コメントをパース。関数・クラス・メソッド単位で構造化した Markdown ドキュメントを生成します。外部ライブラリ不要の自前パーサーで動作します。

## 使い方

```bash
node jsdoc-gen.js
```

## 対応ファイル

`.js` / `.ts` / `.mjs` / `.cjs` / `.jsx` / `.tsx`

`node_modules/` `dist/` `build/` `.next/` `coverage/` は自動でスキップします。

## 対応 JSDoc タグ

| タグ | 内容 |
|---|---|
| `@param {type} name - desc` | パラメータ（`[name]` でオプション判定） |
| `@returns {type} desc` | 戻り値 |
| `@throws {type} desc` | 例外 |
| `@example` | 使用例（コードブロックとして出力） |
| `@deprecated` | 非推奨の警告表示 |
| `@since` | 追加バージョン |
| `@see` | 参照リンク |

## 宣言の自動検出

| パターン | 種別 |
|---|---|
| `function name(...)` | function |
| `const name = (...) =>` | function |
| `const name = function(...)` | function |
| `class Name` | class |
| `methodName(...)` | method |
| `interface / type Name` | type |
| `export` 付き全パターン対応 | — |

## 生成ドキュメント例

入力:
```javascript
/**
 * ユーザーデータを取得する
 * @param {string} userId - ユーザーID
 * @param {Object} [options] - オプション設定
 * @returns {Promise<User>} ユーザーオブジェクト
 * @throws {Error} ユーザーが見つからない場合
 * @since 1.2.0
 * @example
 * const user = await fetchUser('u123');
 */
async function fetchUser(userId, options) { ... }
```

出力:
```markdown
### `fetchUser(userId, options)` <sup>function</sup>

ユーザーデータを取得する

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `userId` | `string` | 必須 | ユーザーID |
| `options` | `Object` | オプション | オプション設定 |

**戻り値:** `Promise<User>` — ユーザーオブジェクト

**例外:**
- `Error` — ユーザーが見つからない場合

**使用例:**
```js
const user = await fetchUser('u123');
```

**Since:** 1.2.0
```

## 出力先

デフォルト: `docs/API.md`

## 依存パッケージ

なし（Node.js 標準モジュールのみ）
