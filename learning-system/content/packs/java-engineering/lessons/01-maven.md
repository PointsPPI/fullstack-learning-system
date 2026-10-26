# Maven 构建工具

::: key 一句话抓住本质
Maven 解决的是一个问题：**"我写的代码依赖别人的代码，这些依赖怎么自动下载、编译、打包、发布？"**
在你只有 3 个文件时手写 `javac` 就行；有了 30 个第三方库时，就必须有人帮你管。
:::

## 学习点

| # | 知识点 | 一句话 |
|---|---|---|
| 1 | 坐标 GAV 与仓库 | 如何唯一定位一个 jar |
| 2 | 依赖传递与冲突调解 | 两个库依赖了不同版本的同一个库，听谁的 |
| 3 | 依赖范围 scope | compile / provided / runtime / test |
| 4 | 生命周期与插件 | 为什么 `mvn package` 会编译又打包 |
| 5 | parent 与 BOM | 版本统一管理 |
| 6 | 多模块 | 一个大项目拆成多个 jar |
| 7 | 常见报错 | 依赖下载不下来怎么办 |

---

## 一、坐标 GAV 与仓库

### 一个 jar 的唯一身份

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>        <!-- 组织，通常是反写域名 -->
  <artifactId>spring-boot-starter-web</artifactId>   <!-- 项目名 -->
  <version>3.3.13</version>                          <!-- 版本 -->
</dependency>
```

仓库里的物理路径：

```
~/.m2/repository/org/springframework/boot/spring-boot-starter-web/3.3.13/
  spring-boot-starter-web-3.3.13.pom    ← 描述文件（它的依赖写在这里）
  spring-boot-starter-web-3.3.13.jar    ← 实际代码
  spring-boot-starter-web-3.3.13-sources.jar  ← 源码（可选）
```

::: tip 为什么必须写坐标而不是给个 URL
因为只有这样，Maven 才能：
1. 去仓库**按路径找**（不需要索引，直接按坐标拼路径）
2. **递归解析**：读 pom 里的 dependencies → 继续下载它们的依赖
3. **冲突调解**：同一 artifactId 不同版本，按规则选一个

给 URL 就做不到这一切。
:::

### 三处仓库的优先级

```
① 本地仓库 ~/.m2/repository  ← 有就不联网，最快
② 私服（Nexus/Artifactory）   ← 企业内网，缓存中央仓库 + 存内部 jar
③ 中央仓库（repo.maven.apache.org）
```

`settings.xml` 里配镜像（国内必配）：

```xml
<mirrors>
  <mirror>
    <id>aliyun</id>
    <url>https://maven.aliyun.com/repository/public</url>
    <mirrorOf>central</mirrorOf>   <!-- 拦截所有对 central 的请求 -->
  </mirror>
</mirrors>
```

### 常用命令

```bash
mvn clean               # 删 target
mvn compile             # 编译到 target/classes
mvn test                # 编译 + 跑单元测试
mvn package             # 打包（jar/war）到 target/
mvn install             # 打包 + 安装到本地仓库（其他项目能引用）
mvn deploy              # 上传到远程仓库
mvn dependency:tree     # 打印依赖树（排查冲突神器）
mvn dependency:resolve  # 下载所有依赖但不编译
mvn -DskipTests package # 跳过测试打包
mvn -U clean package    # 强制更新快照依赖
mvn -o package          # 离线模式（不联网）
```

---

## 二、依赖传递与冲突调解

### 传递依赖

你只声明了 A，A 依赖 B，B 依赖 C —— Maven 会自动把 B 和 C 都拉下来。

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!-- 实际会下载：spring-webmvc、spring-web、tomcat-embed-core、jackson... 几十个 -->
```

查看实际拉了什么：

```bash
mvn dependency:tree
```

```
[INFO] +- org.springframework.boot:spring-boot-starter-web:jar:3.3.13:compile
[INFO] |  +- org.springframework.boot:spring-boot-starter:jar:3.3.13:compile
[INFO] |  |  +- org.springframework.boot:spring-boot:jar:3.3.13:compile
[INFO] |  |  +- org.springframework.boot:spring-boot-autoconfigure:jar:3.3.13:compile
[INFO] |  +- org.springframework:spring-web:jar:6.1.14:compile
[INFO] |  +- org.apache.tomcat.embed:tomcat-embed-core:jar:10.1.31:compile
```

### 冲突调解的两条规则

::: key Maven 选版本的规则（按顺序）
**规则 1：路径最短优先**
```
A → B → C(1.0)        路径长度 3
A → D → E → C(2.0)    路径长度 4
→ 选 C 1.0
```

**规则 2：路径长度相同时，先声明的优先**
```xml
<dependency>X</dependency>   <!-- 依赖 C 1.0 -->
<dependency>Y</dependency>   <!-- 依赖 C 2.0 -->
<!-- 选 C 1.0，因为 X 写在前面 -->
```
:::

### 排查与解决冲突

```bash
# 1. 找出谁引入了旧版本
mvn dependency:tree -Dincludes=commons-logging:commons-logging

# 2. 看"冲突"，Maven 3 会标注 omitted
mvn dependency:tree -Dverbose
```

三种解决方式：

```xml
<!-- ① 排除法：明确不要这个传递依赖 -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
  <exclusions>
    <exclusion>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-tomcat</artifactId>
    </exclusion>
  </exclusions>
</dependency>

<!-- ② 直接声明：把想要的版本写进 dependencies（最短路径 = 1，必然胜出） -->
<dependency>
  <groupId>ch.qos.logback</groupId>
  <artifactId>logback-classic</artifactId>
  <version>1.5.12</version>
</dependency>

<!-- ③ dependencyManagement：只声明版本，不实际引入 -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>ch.qos.logback</groupId>
      <artifactId>logback-classic</artifactId>
      <version>1.5.12</version>
    </dependency>
  </dependencies>
</dependencyManagement>
```

::: tip dependencyManagement 和 dependencies 的区别（面试常考）
- `<dependencies>`：**真的引入** jar，参与传递
- `<dependencyManagement>`：**只规定版本**，不引入。子模块声明时省略 version，自动继承这里的版本

这是 Spring Boot parent 的核心机制：它管理了 300+ 依赖的版本，你写依赖时不用写 version。
:::

::: danger 一个真实事故：日志冲突
项目里有 `log4j` 和 `logback` 两个日志实现（因为某个旧库传递引入了 log4j），
启动时报 `Class path contains multiple SLF4J bindings`，然后日志行为诡异。

**排查**：`mvn dependency:tree | grep -i log`
**解决**：exclusion 掉旧的，或者统一用 logback。
:::

---

## 三、依赖范围 scope

| scope | 编译 | 测试 | 运行 | 打包进 jar | 会传递 | 典型例子 |
|---|---|---|---|---|---|---|
| `compile`（默认） | ✓ | ✓ | ✓ | ✓ | ✓ | spring-core、mybatis |
| `provided` | ✓ | ✓ | ✗ | ✗ | ✗ | servlet-api、lombok |
| `runtime` | ✗ | ✓ | ✓ | ✓ | ✓ | jdbc 驱动、日志实现 |
| `test` | ✗ | ✓ | ✗ | ✗ | ✗ | junit、mockito |
| `system`（不推荐） | ✓ | ✓ | ✗ | ✗ | ✗ | 本地 jar（用 install 代替） |

::: key 为什么 provided 不打包
`servlet-api` 在 Tomcat 里**已经有了**。
如果你把它打进 war，Tomcat 加载时就会出现"同一个类被加载两次"的问题（甚至 ClassCastException）。

同理 `lombok` 是编译期注解处理器，编译完就没用了，绝不能进运行时。

:::danger 常见错误
```xml
<!-- ✗ 用 compile 引入 servlet-api → 部署到 Tomcat 就炸 -->
<dependency>
  <groupId>jakarta.servlet</groupId>
  <artifactId>jakarta.servlet-api</artifactId>
  <version>6.0.0</version>
</dependency>

<!-- ✓ -->
<dependency>
  <groupId>jakarta.servlet</groupId>
  <artifactId>jakarta.servlet-api</artifactId>
  <version>6.0.0</version>
  <scope>provided</scope>
</dependency>
```

**注意**：Spring Boot 的 `spring-boot-starter-web` 已经正确处理了这些，
所以用 starter 时你根本不需要操心。
:::

::: warn 为什么 JDBC 驱动用 runtime
```xml
<dependency>
  <groupId>com.mysql</groupId>
  <artifactId>mysql-connector-j</artifactId>
  <scope>runtime</scope>
</dependency>
```
因为你的代码里**从不 import 任何 MySQL 的类**（只用 `java.sql.*` 标准接口），
只在运行时通过 `DriverManager` 反射加载。所以编译期不需要它。

这正好体现了 JDBC 的设计智慧：**面向接口编程，驱动可替换**。
:::

---

## 四、生命周期与插件

### 三套生命周期

::: compare
| 生命周期 | 阶段（主要） | 用途 |
|---|---|---|
| **clean** | pre-clean → clean → post-clean | 清理 target |
| **default** | validate → compile → test → package → verify → install → deploy | 构建主流程 |
| **site** | site → site-deploy | 生成文档站点 |
:::

关键理解：**执行某个阶段，会自动执行它之前的所有阶段。**

```bash
mvn package
# 实际执行：validate → compile → test → package
```

### default 生命周期完整阶段

| 阶段 | 做什么 |
|---|---|
| `validate` | 校验项目配置正确 |
| `initialize` | 初始化构建状态 |
| `generate-sources` | 生成源码（如 protobuf） |
| `process-sources` | 处理源码资源 |
| `generate-resources` | 生成资源 |
| **`compile`** | 编译主代码 → `target/classes` |
| `process-classes` | 编译后处理（字节码增强） |
| `generate-test-sources` | 生成测试源码 |
| `process-test-sources` | 处理测试资源 |
| **`test-compile`** | 编译测试代码 |
| **`test`** | 运行单元测试 |
| `prepare-package` | 打包前准备 |
| **`package`** | 打包成 jar/war |
| `pre-integration-test` | 集成测试前 |
| `integration-test` | 跑集成测试 |
| `post-integration-test` | 集成测试后 |
| `verify` | 校验包有效 |
| **`install`** | 安装到本地仓库 |
| **`deploy`** | 部署到远程仓库 |

### 插件绑定

```xml
<build>
  <plugins>
    <!-- 强制 JDK 21 + UTF-8 -->
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-compiler-plugin</artifactId>
      <configuration>
        <release>21</release>
        <encoding>UTF-8</encoding>
      </configuration>
    </plugin>

    <!-- Spring Boot 打包插件：生成可执行 jar（含内嵌 Tomcat） -->
    <plugin>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-maven-plugin</artifactId>
    </plugin>

    <!-- 跳过测试 -->
    <plugin>
      <groupId>org.apache.maven.plugins</groupId>
      <artifactId>maven-surefire-plugin</artifactId>
      <configuration>
        <skipTests>true</skipTests>
      </configuration>
    </plugin>
  </plugins>
</build>
```

::: key 插件目标（goal）与阶段的绑定
插件本身不知道什么时候执行，是"绑定到某个阶段"后才自动跑。

```bash
# 直接调用插件目标（不经过生命周期）
mvn dependency:tree
mvn spring-boot:run
mvn compiler:compile
```

`mvn spring-boot:run` 就是一个插件目标，直接启动应用，不打包。
:::

---

## 五、parent 与 BOM

### parent 继承

```xml
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.3.13</version>
  <relativePath/>   <!-- 空值表示只从仓库找，不从上级目录找 -->
</parent>

<groupId>com.bookhub</groupId>
<artifactId>bookhub</artifactId>
<version>1.0.0</version>
```

继承来的东西：

```xml
<!-- 1. 依赖版本管理（300+ 依赖不用写 version） -->
<dependency>
  <groupId>com.mysql</groupId>
  <artifactId>mysql-connector-j</artifactId>
  <!-- 无 version，从 parent 继承 -->
</dependency>

<!-- 2. 插件配置（compiler / surefire / jar 都配好了） -->
<!-- 3. 资源过滤、编码设置 -->
<!-- 4. properties 默认值（java.version 等） -->
```

::: tip 为什么 relativePath 要写空
```xml
<relativePath/>
```
如果你的项目目录正好在一个更大的 Maven 项目下面，Maven 会**先**去上级目录找 parent。
找不到（或者找到的版本不对）才会去仓库。写空值强制只从仓库找，避免这种"诡异的找不到 parent"问题。
:::

### BOM（Bill of Materials）

BOM 是一个**只有 dependencyManagement、没有实际代码**的 pom。

```xml
<dependencyManagement>
  <dependencies>
    <!-- 引入别人做好的 BOM -->
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-dependencies</artifactId>
      <version>3.3.13</version>
      <type>pom</type>
      <scope>import</scope>     <!-- 关键：import 表示"导入它的版本管理" -->
    </dependency>
  </dependencies>
</dependencyManagement>
```

::: compare parent vs BOM
| | parent | BOM（import） |
|---|---|---|
| 继承方式 | **单继承**（只能有一个 parent） | **可多个**（import 多个 BOM） |
| 能继承什么 | 依赖版本 + 插件 + 属性 + 构建配置 | 只有依赖版本 |
| 典型场景 | 公司统一父 pom | 引入第三方版本管理（如 spring-cloud-dependencies） |

**所以 Spring Cloud 项目会这样写**：parent 用 spring-boot-starter-parent，
dependencyManagement 里 import spring-cloud-dependencies。两个都用。
:::

---

## 六、多模块

### 结构

```
parent/                    ← 聚合 + 版本管理，packaging=pom
├── pom.xml                ← <modules> 列出子模块
├── common/                ← 工具类、统一响应
│   └── pom.xml            ← parent 是 parent 项目
├── dao/                   ← 数据访问
│   └── pom.xml            ← 依赖 common
├── service/               ← 业务逻辑
│   └── pom.xml            ← 依赖 dao
└── web/                   ← 控制器 + 启动类
    └── pom.xml            ← 依赖 service
```

### parent pom.xml

```xml
<project>
  <groupId>com.bookhub</groupId>
  <artifactId>bookhub-parent</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>   <!-- 关键：它自己不产出 jar -->

  <modules>
    <module>common</module>
    <module>dao</module>
    <module>service</module>
    <module>web</module>
  </modules>

  <properties>
    <java.version>21</java.version>
    <mybatis.version>3.0.4</mybatis.version>
  </properties>

  <dependencyManagement>
    <dependencies>
      <!-- 内部模块的版本也统一在这里管 -->
      <dependency>
        <groupId>com.bookhub</groupId>
        <artifactId>common</artifactId>
        <version>${project.version}</version>
      </dependency>
      <dependency>
        <groupId>com.bookhub</groupId>
        <artifactId>dao</artifactId>
        <version>${project.version}</version>
      </dependency>
    </dependencies>
  </dependencyManagement>
</project>
```

### 子模块

```xml
<!-- dao/pom.xml -->
<project>
  <parent>
    <groupId>com.bookhub</groupId>
    <artifactId>bookhub-parent</artifactId>
    <version>1.0.0</version>
  </parent>

  <artifactId>dao</artifactId>     <!-- 不需要写 groupId 和 version，继承 -->

  <dependencies>
    <dependency>
      <groupId>com.bookhub</groupId>
      <artifactId>common</artifactId>   <!-- 不需要写 version，从 dependencyManagement 继承 -->
    </dependency>
  </dependencies>
</project>
```

::: key 聚合 vs 继承 是两件不同的事
- **聚合**（`<modules>`）：我在父目录执行 `mvn package`，会依次构建所有子模块。**构建关系**
- **继承**（`<parent>`）：子模块继承父模块的配置。**配置关系**

它们通常一起用，但概念不同。父 pom 可以只聚合不继承（modules 里的项目 parent 指向别处），
也可以只继承不聚合。
:::

### 多模块的常见坑

::: danger 三个高频问题
**① 子模块之间找不到类**
原因：`dao` 依赖 `common`，但 `common` 没有 `mvn install` 到本地仓库。
解决：在**父目录**执行 `mvn install`（一次性构建所有模块），不要单独在某一个子模块里执行。

**② 启动类找不到**
Spring Boot 的启动类必须在**最外层包**，才能扫描到所有子模块的组件。
```
com.bookhub.BookHubApplication        ← 在这里
com.bookhub.common.*
com.bookhub.dao.*
com.bookhub.service.*
com.bookhub.web.*                     ← 都能扫到
```
如果启动类放在 `com.bookhub.web`，就扫不到 `dao` 包 → 报 `NoSuchBeanDefinitionException`。

**③ web 模块打包失败**
因为 `spring-boot-maven-plugin` 在父 pom 里配置的话，
所有子模块都会被打成可执行 jar，包括被依赖的 common/dao —— 它们被依赖时会出问题。
**解法**：插件只在 web 模块声明，或用 `<skip>` 在其他模块跳过。
:::

---

## 七、常见报错与排查

### 1. 依赖下载不下来

```
Could not resolve dependencies for project ...:
Failed to collect dependencies at ...
```

排查顺序：

```bash
# ① 网络：能不能访问仓库
curl -I https://maven.aliyun.com/repository/public/

# ② 本地仓库是否有残留锁文件
ls ~/.m2/repository/**/*.lastUpdated
# 删除 .lastUpdated 文件后重试（很多时候是上次失败留下的）

# ③ 强制更新
mvn -U clean install

# ④ 看详细日志
mvn -X clean install
```

::: tip `.lastUpdated` 文件是什么
Maven 下载失败时会留一个 `xxx.jar.lastUpdated` 标记，记录"我试过了，失败了"。
下次构建时它看到这个文件就**直接跳过**，不再尝试下载，导致你莫名其妙一直失败。

**解决：删掉所有 `.lastUpdated` 文件**
```bash
find ~/.m2/repository -name "*.lastUpdated" -delete
```
:::

### 2. 版本冲突导致 NoSuchMethodError

```
java.lang.NoSuchMethodError: 'void com.google.common.base.Preconditions.checkArgument(...)'
```

原因：编译时用的是 guava 新版本，运行时 classpath 里是旧版本。

```bash
mvn dependency:tree -Dincludes=com.google.guava:guava
```
看到两个版本 → 用 exclusion 或直接声明想要的版本。

### 3. 编译报"不支持发行版本"

```
error: invalid source release: 21
```

三处必须一致：
```xml
<properties>
  <java.version>21</java.version>
  <maven.compiler.release>21</maven.compiler.release>
</properties>
```
以及 `JAVA_HOME` 指向 JDK 21。

### 4. 中文乱码

```xml
<properties>
  <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
</properties>
```

还要看：
- 源文件本身是不是 UTF-8 保存的
- 控制台代码页（Windows `chcp 65001`）
- `-Dfile.encoding=UTF-8`

::: danger 乱码的排查顺序（从外到内）
1. **文件编码**：编辑器右下角显示的编码
2. **编译编码**：`project.build.sourceEncoding`
3. **JVM 运行编码**：`-Dfile.encoding=UTF-8`（JDK 18+ 默认 UTF-8）
4. **控制台编码**：Windows 终端代码页
5. **HTTP 响应编码**：`Content-Type: text/html; charset=utf-8`

**任何一环不对都会乱码。先确认第 1 环。**
:::

### 5. Maven 版本与插件不兼容

```
Unsupported class file major version 65
```
JDK 21 编译的 class 文件是 major 65，老的插件（如旧版 surefire）读不了。
解决：升级插件版本，或用 Spring Boot parent 提供的版本。

::: warn 这也是本工坊自带 Maven 3.9.9 的原因
你机器上全局是 **Maven 4.0.0-rc-5**（RC 版），部分 Spring Boot 插件尚未完全适配。
本工坊在 `tools/maven/maven-3.9.9` 放了一份独立的 3.9.9，
项目里的 `mvnw.cmd` 固定用它 —— **不动你的全局环境，也不动 `~/.m2`**。
:::

---

## 八、本节速查

```xml
<!-- 坐标 -->
<dependency>
  <groupId>g</groupId><artifactId>a</artifactId><version>v</version>
  <scope>compile|provided|runtime|test</scope>
  <exclusions><exclusion><groupId/><artifactId/></exclusion></exclusions>
</dependency>

<!-- 版本管理 -->
<dependencyManagement><dependencies>...</dependencies></dependencyManagement>
<!-- BOM 导入 -->
<dependency><type>pom</type><scope>import</scope></dependency>

<!-- 打包 -->
<packaging>jar|war|pom</packaging>
```

```bash
# 命令
mvn clean install -DskipTests     # 常用组合
mvn dependency:tree               # 看依赖树
mvn dependency:tree -Dverbose     # 看冲突
mvn -U clean package              # 强制更新
mvn -o package                    # 离线
```

::: key scope 记忆口诀
- **compile**：我写的代码直接用它的类 → 打包带上
- **provided**：容器/运行环境已经提供 → 不打包（servlet-api、lombok）
- **runtime**：我编译时不用，运行时才需要（通过反射/SPI） → 打包带上（JDBC 驱动）
- **test**：只有测试用 → 不打包
:::

::: interview 面试高频
**Q：Maven 的依赖冲突怎么解决？调解规则是什么？**
A：规则是"路径最短优先，长度相同则先声明优先"。
解决方式：`mvn dependency:tree` 定位 → exclusion 排除 / 直接声明想要版本（路径最短必赢）/
`dependencyManagement` 统一版本。

**Q：`<dependencyManagement>` 和 `<dependencies>` 的区别？**
A：`dependencies` 真的引入 jar；`dependencyManagement` 只声明版本不引入，
子模块引用时省略 version 即可继承。Spring Boot parent 靠它统一 300+ 依赖版本。

**Q：scope 有哪几种？provided 和 compile 的区别？**
A：compile/provided/runtime/test/system。provided 表示编译需要但运行环境已提供，
所以不打包（如 servlet-api、lombok）。用 compile 引入 servlet-api 会导致部署到 Tomcat 时类冲突。

**Q：多模块项目，子模块互相依赖，为什么找不到类？**
A：因为被依赖的模块没有安装到本地仓库。要在**父目录**执行 `mvn install`
（一次构建全部），而不是在单个子模块里执行。

**Q：`mvn package` 会执行哪些阶段？**
A：validate → compile → test → package。执行某阶段会自动执行它之前的全部阶段。
加 `-DskipTests` 只跳过测试执行，仍然会编译测试代码；`-Dmaven.test.skip=true` 连编译都跳过。
:::

---

## 延伸练习

1. 打开本工坊 `project/bookhub/pom.xml`，找出：parent、properties、三个 scope 各自用在哪。
2. 执行 `mvnw.cmd dependency:tree`，数一数 spring-boot-starter-web 一共拉了多少个传递依赖。
3. 故意引入两个版本的同一个库（如同时声明 guava 32 和 30），用 `dependency:tree -Dverbose` 看谁被 omitted。
4. 把 `mysql-connector-j` 的 scope 从 runtime 改成 compile，观察打包后的 jar 有没有变化。
5. 删掉 `~/.m2/repository` 里某个依赖的 `.lastUpdated` 文件，理解它为什么会阻止下载。
6. 在父目录执行 `mvnw.cmd install`，然后单独进 `project/bookhub` 执行 `mvnw.cmd package`，对比差异。
