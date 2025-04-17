import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as CdkLoadbalancer from '../lib/cdk-loadbalancer-stack';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

// cdk.json から staging 環境のコンテキストを取得 (テスト用に簡略化)
// 実際のテスト環境では cdk.json を読み込むか、固定値を使用します
const stagingContext = {
  Stage: 'staging',
  ResourceName: 'Staging',
  Region: 'ap-northeast-1', // リージョンはスタックプロパティで必要
  VPC: 'vpc-xxxx', // ダミーまたは実際のVPC ID
  CertificateArn: 'arn:aws:acm:us-east-1:xxxxxxxxxxxx:certificate/xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // ダミーまたは実際の証明書ARN
  LogBucket: 'loadbalancer-log-staging-xxxx.com',
  LogFilePrefix: 'xxxx.com'
};

test('Load Balancer Stack Resources Created', () => {
  const app = new cdk.App();
  // スタック環境を指定
  const env = {
    account: '123456789012', // テスト用のダミーアカウント
    region: stagingContext.Region
  };

  // WHEN: スタックを作成
  const stack = new CdkLoadbalancer.CdkLoadbalancerStack(app, 'MyTestLoadBalancerStack', {
    ...stagingContext,
    env: env
  });

  // THEN: テンプレートを生成
  const template = Template.fromStack(stack);

  // 1. ALB の検証
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Name: stagingContext.ResourceName,
    Scheme: 'internet-facing',
    IpAddressType: 'ipv4',
    SecurityGroups: Match.anyValue(), // セキュリティグループIDは動的に決まるため
    Subnets: Match.anyValue(), // サブネットIDはVPCルックアップで決まるため
    LoadBalancerAttributes: Match.arrayWith([
      Match.objectLike({ Key: 'deletion_protection.enabled', Value: 'false' }), // staging は false
      Match.objectLike({ Key: 'routing.http.drop_invalid_header_fields.enabled', Value: 'true' }),
      Match.objectLike({ Key: 'idle_timeout.timeout_seconds', Value: '60' }), // 1 minute
      Match.objectLike({ Key: 'access_logs.s3.enabled', Value: 'true' }),
      Match.objectLike({ Key: 'access_logs.s3.bucket', Value: stagingContext.LogBucket }),
      Match.objectLike({ Key: 'access_logs.s3.prefix', Value: stagingContext.LogFilePrefix }),
    ]),
  });

  // 2. ALB セキュリティグループの検証
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    GroupDescription: `security group for ${stagingContext.ResourceName} LoadBalancer`,
    GroupName: `${stagingContext.ResourceName}-ALB`,
    VpcId: stagingContext.VPC, // fromLookup で指定したVPC IDと一致するか
    SecurityGroupIngress: Match.arrayWith([
      Match.objectLike({ CidrIp: '0.0.0.0/0', IpProtocol: 'tcp', FromPort: 80, ToPort: 80 }),
      Match.objectLike({ CidrIp: '0.0.0.0/0', IpProtocol: 'tcp', FromPort: 443, ToPort: 443 }),
    ]),
    SecurityGroupEgress: Match.arrayWith([
      Match.objectLike({ CidrIp: '0.0.0.0/0', IpProtocol: '-1' }) // Allow all outbound
    ])
  });

  // 3. ターゲットグループの検証
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
    Name: stagingContext.ResourceName,
    Port: 80,
    Protocol: 'HTTP',
    ProtocolVersion: 'HTTP1',
    TargetType: 'instance',
    VpcId: stagingContext.VPC,
    HealthCheck: Match.objectLike({
      Enabled: true,
      Path: '/elb-check.html',
      Protocol: 'HTTP',
      HealthyThresholdCount: 5,
      UnhealthyThresholdCount: 2,
      IntervalSeconds: 30,
      TimeoutSeconds: 5,
      Matcher: { HttpCode: '200' }
    }),
    TargetGroupAttributes: Match.arrayWith([
      Match.objectLike({ Key: 'load_balancing.algorithm.type', Value: 'least_outstanding_requests' })
    ])
  });

  // 4. HTTPS リスナーの検証
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 443,
    Protocol: 'HTTPS',
    Certificates: Match.arrayWith([
      Match.objectLike({ CertificateArn: stagingContext.CertificateArn })
    ]),
    DefaultActions: Match.arrayWith([
      Match.objectLike({ Type: 'forward' }) // ターゲットグループへフォワード
    ]),
    SslPolicy: elbv2.SslPolicy.RECOMMENDED.toString(), // 推奨ポリシー
  });

  // 5. HTTP リスナー (リダイレクト) の検証
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 80,
    Protocol: 'HTTP',
    DefaultActions: Match.arrayWith([
      Match.objectLike({
        Type: 'redirect',
        RedirectConfig: Match.objectLike({
          Protocol: 'HTTPS',
          Port: '443',
          StatusCode: 'HTTP_301' // デフォルトのリダイレクトコード
        })
      })
    ]),
  });

  // 6. ログ用 S3 バケットの検証
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: stagingContext.LogBucket,
    AccessControl: 'LogDeliveryWrite',
    // staging では RemovalPolicy.DESTROY なので BucketEncryption はデフォルトでは設定されない
  });
  // S3 バケットポリシー (ログ配信用) の検証も追加可能

  // 7. 出力の検証
  template.hasOutput('LoadBalancerDNSName', {});
});
