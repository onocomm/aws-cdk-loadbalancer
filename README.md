# AWS CDK LoadBalancer プロジェクト

このプロジェクトは、AWS CDK（Cloud Development Kit）を使用して、Application Load Balancer（ALB）のインフラストラクチャをコード化したものです。

## 概要

このCDKプロジェクトは、以下の機能を持つApplication Load Balancerを構築します：

- 指定したVPC内にALBを作成
- セキュリティグループの自動設定（HTTP/HTTPS接続の許可）
- HTTPSリスナーの設定（ACMからの証明書使用）
- HTTPからHTTPSへの自動リダイレクト
- S3バケットへのアクセスログ記録
- 環境（本番/ステージング）に応じた設定の切り替え
- ヘルスチェックの設定

## 前提条件

- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) がインストールされていること
- AWS アカウントと適切な認証情報の設定
- Node.js 16.x 以上
- TypeScript 4.x 以上

## インストール

```bash
# リポジトリをクローン
git clone <リポジトリURL>

# プロジェクトディレクトリに移動
cd aws-cdk-loadbalancer

# 依存パッケージをインストール
npm install
```

## 環境設定

プロジェクトは `cdk.json` ファイル内の環境設定に基づいて動作します。環境ごとに以下のパラメータを設定できます：

- `ResourceName`: リソース名のプレフィックス
- `Region`: AWS リージョン
- `VPC`: 使用するVPC ID
- `CertificateArn`: SSL/TLS証明書のARN
- `LogBucket`: アクセスログを保存するS3バケット名
- `LogFilePrefix`: ログファイルのプレフィックス

```json
{
  "production": {
    "ResourceName": "Production",
    "Region": "ap-northeast-1",
    "VPC": "vpc-xxxxxxxx",
    "CertificateArn": "arn:aws:acm:us-east-1:xxxxxxxxxxxx:certificate/xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "LogBucket": "loadbalancer-log-production-xxxx.com",
    "LogFilePrefix": "xxxx.com"
  },
  "staging": {
    "ResourceName": "Staging",
    "Region": "ap-northeast-1",
    "VPC": "vpc-xxxx",
    "CertificateArn": "arn:aws:acm:us-east-1:xxxxxxxxxxxx:certificate/xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "LogBucket": "loadbalancer-log-staging-xxxx.com",
    "LogFilePrefix": "xxxx.com"
  }
}
```

## 使用方法

### 環境変数の設定

デプロイする環境を指定するには、環境変数 `CDK_ENV` を設定します。設定しない場合は、デフォルトで `production` 環境が使用されます。

```bash
# 本番環境へのデプロイ
export CDK_ENV=production

# ステージング環境へのデプロイ
export CDK_ENV=staging
```

### デプロイ

```bash
# CDKアプリのビルド
npm run build

# スタックの合成（CloudFormationテンプレートの生成）
npx cdk synth

# デプロイの実行
npx cdk deploy
```

### ロールバック

```bash
# 前のバージョンにロールバック
npx cdk deploy --rollback
```

### スタックの削除

```bash
npx cdk destroy
```

## プロジェクト構造

```
aws-cdk-loadbalancer/
├── bin/                    # CDKアプリケーションのエントリーポイント
│   └── cdk-loadbalancer.ts # メインアプリケーション
├── lib/                    # CDKスタックの定義
│   └── cdk-loadbalancer-stack.ts # ALBスタックの実装
├── test/                   # テストコード
├── cdk.json                # CDK設定ファイル
├── package.json            # プロジェクト依存関係
└── tsconfig.json           # TypeScript設定
```

## 作成されるリソース

このCDKスタックは以下のAWSリソースを作成します：

1. **Application Load Balancer**
   - インターネット向けのロードバランサー
   - クライアントキープアライブ：1時間
   - アイドルタイムアウト：1分
   - 無効なヘッダーフィールドの破棄：有効
   - HTTP/2：無効
   - 削除保護：本番環境のみ有効

2. **セキュリティグループ**
   - 80ポート（HTTP）と443ポート（HTTPS）への接続を許可

3. **ターゲットグループ**
   - プロトコル：HTTP
   - ポート：80
   - プロトコルバージョン：HTTP1
   - IPアドレスタイプ：IPv4
   - ターゲットタイプ：インスタンス
   - 負荷分散アルゴリズム：最小未処理リクエスト
   - ヘルスチェック：
     - パス：/elb-check.html
     - 間隔：30秒
     - タイムアウト：5秒
     - 正常しきい値：5
     - 異常しきい値：2

4. **リスナー**
   - HTTPSリスナー（443ポート）
   - HTTP→HTTPSリダイレクト（80→443）

5. **S3バケット**
   - アクセスログの保存用
   - 本番環境は削除時にリソースを保持、それ以外の環境は削除

## 注意事項

- 本番環境では、ALBの削除保護が有効になっています。削除する場合は、削除保護を無効にしてから実行してください。
- ロードバランサーのアクセスログは指定したS3バケットに保存されます。
- ステージング環境と本番環境で設定が異なる場合があります。デプロイ前に必ず確認してください。

## カスタマイズ

カスタマイズが必要な場合は、`lib/cdk-loadbalancer-stack.ts` ファイルを編集してください。主な設定項目は以下の通りです：

- ヘルスチェックの設定
- ロードバランサーのタイムアウト設定
- セキュリティグループのルール
- リスナーのSSLポリシー
