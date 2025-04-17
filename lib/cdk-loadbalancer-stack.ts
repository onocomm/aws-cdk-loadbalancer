import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// カスタムプロパティの型を定義
interface CdkStackProps extends StackProps {
  Stage: string;
  ResourceName: string;
  VPC: string;
  CertificateArn: string;
  LogBucket: string;
  LogFilePrefix: string;
}

export class CdkLoadbalancerStack extends Stack {
  constructor(scope: Construct, id: string, props: CdkStackProps) {
    super(scope, id, props);

    // ✅ props が undefined の場合、エラーを回避
    if (!props) {
      throw new Error('props is required for CdkLoadbalancerStack');
    }
    
    // ✅ props から必要な値を取得
    const {
      Stage,
      ResourceName,
      VPC,
      CertificateArn,
      LogBucket,
      LogFilePrefix,
    } = props as CdkStackProps;

    // ✅ VPCを指定
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId: VPC } )

    // ✅ ALBのセキュリティグループを作成
    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
      securityGroupName: `${ResourceName}-ALB`,
      description: `security group for ${ResourceName} LoadBalancer`,
    })
    securityGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(80), 'Allow inbound HTTP')
    securityGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(443), 'Allow inbound HTTPS')

    // ✅ ALBを作成
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      loadBalancerName: ResourceName,
      vpc: vpc,
      securityGroup: securityGroup,
      internetFacing: true,
      clientKeepAlive: Duration.hours(1),
      idleTimeout: Duration.minutes(1),
      dropInvalidHeaderFields: true,
      http2Enabled: false,
      deletionProtection: Stage === 'production' ? true : false,
    });

    // ✅ ターゲットグループを作成
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      targetGroupName: ResourceName,
      vpc: vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      protocolVersion: elbv2.ApplicationProtocolVersion.HTTP1,
      ipAddressType: elbv2.TargetGroupIpAddressType.IPV4,
      targetType: elbv2.TargetType.INSTANCE,
      loadBalancingAlgorithmType: elbv2.TargetGroupLoadBalancingAlgorithmType.LEAST_OUTSTANDING_REQUESTS,
      healthCheck: {
        enabled: true,
        protocol: elbv2.Protocol.HTTP,
        healthyHttpCodes: '200',
        path: '/elb-check.html',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 5,
        unhealthyThresholdCount: 2,
      }
    });

    // ✅ HTTPSリスナーを作成
    loadBalancer.addListener('ListenerHTTPS', {
      certificates: [{certificateArn: CertificateArn}],
      defaultTargetGroups: [targetGroup],
      port: 443,
      sslPolicy: elbv2.SslPolicy.RECOMMENDED,
      protocol: elbv2.ApplicationProtocol.HTTPS,
    });

    // ✅ HTTP → HTTPSリダイレクトリスナーを作成
    loadBalancer.addRedirect({
      sourcePort: 80,
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      targetPort: 443,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
    });

    // ✅ ログバケットの作成
    const logBucket = new s3.Bucket(this, 'LogBucket', {
      bucketName: LogBucket,
      autoDeleteObjects: false,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      removalPolicy: Stage === 'production' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    // ✅ ログの設定
    loadBalancer.logAccessLogs(logBucket, LogFilePrefix);
    
    new CfnOutput(this, 'LoadBalancerDNSName', {
      description: 'ロードバランサーDNS名',
      value: loadBalancer.loadBalancerDnsName,
    });
  }
}
