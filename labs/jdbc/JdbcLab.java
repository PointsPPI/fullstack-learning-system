package jdbc;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * JDBC 对照实验 —— 用 main 方法直接跑，不需要 Spring、不需要测试框架。
 *
 * <pre>
 * 运行方式（在 labs/jdbc 目录）：
 *   javac -encoding UTF-8 -d out JdbcLab.java
 *   java -cp out:mysql-connector.jar jdbc.JdbcLab
 *
 * 但更简单的方式：本工坊已把驱动下载到 Maven 本地仓库，可以直接：
 *   java -cp "../../tools/maven/repo/com/mysql/mysql-connector-j/8.4.0/mysql-connector-j-8.4.0.jar;out" jdbc.JdbcLab
 *
 * 或者直接跑本目录的 run.bat
 *
 * ⚠️ 本类演示的"不安全的写法"只用于教学。
 *    真实项目里绝对不能把用户输入拼进 SQL。
 * </pre>
 */
public class JdbcLab {

    static final String URL = "jdbc:mysql://127.0.0.1:3307/bookhub"
            + "?useUnicode=true&characterEncoding=utf8"
            + "&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true";
    static final String USER = "bh";
    static final String PWD = "bh_pwd_2026";

    public static void main(String[] args) throws Exception {
        // ① 加载驱动 —— JDBC 4.0+ 由 SPI 自动发现（META-INF/services/java.sql.Driver）
        //    显式调用是历史写法，但保留一行能让你看清"第一步"是什么。
        //    如果去掉这行仍报 "No suitable driver found"：
        //      → 说明驱动 jar 不在 classpath 里（这才是真正原因，不是缺这一行）
        try {
            Class.forName("com.mysql.cj.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            System.err.println("× 找不到 MySQL 驱动类。请确认 classpath 里有 mysql-connector-j-*.jar");
            System.err.println("  当前 classpath: " + System.getProperty("java.class.path"));
            return;
        }

        System.out.println("═══════════════════════════════════════════════════════");
        System.out.println(" JDBC 对照实验");
        System.out.println("═══════════════════════════════════════════════════════");
        System.out.println();

        try (Connection conn = DriverManager.getConnection(URL, USER, PWD)) {
            System.out.println("✓ 数据库已连接：" + conn.getMetaData().getURL());
            System.out.println();

            step1SixSteps(conn);
            step2Injection(conn);
            step3Batch(conn);
            step4Transaction(conn);
        }

        System.out.println();
        System.out.println("═══════════════════════════════════════════════════════");
        System.out.println(" 全部实验完成");
        System.out.println("═══════════════════════════════════════════════════════");
    }

    /* ══════════ 实验 1：六步流程 ══════════ */
    static void step1SixSteps(Connection conn) throws SQLException {
        System.out.println("【实验 1】JDBC 六步流程");
        System.out.println("───────────────────────────────────────────────────────");

        // ③ 创建语句对象（预编译）
        String sql = "SELECT id, title, author, price FROM book WHERE category_id = ? ORDER BY id LIMIT 5";

        // ④ set 参数 + 执行
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, 1L);

            // ⑤ 处理结果集
            try (ResultSet rs = ps.executeQuery()) {
                int n = 0;
                while (rs.next()) {
                    n++;
                    System.out.printf("  %-3d %-28s %-18s %8.2f%n",
                            rs.getLong("id"),
                            rs.getString("title"),
                            rs.getString("author"),
                            rs.getBigDecimal("price"));
                }
                System.out.println("  → 共 " + n + " 行");
            }
        }
        System.out.println();
    }

    /* ══════════ 实验 2：SQL 注入对照 ══════════ */
    static void step2Injection(Connection conn) throws SQLException {
        System.out.println("【实验 2】SQL 注入对照（教学用，勿在生产复制）");
        System.out.println("───────────────────────────────────────────────────────");

        String normal = "R2026001";
        String attack1 = "x' OR '1'='1";
        String attack2 = "' OR '1'='1' -- ";

        System.out.println("  查 reader 表，条件是 card_no = ?");
        System.out.println();

        // ---- ✗ 不安全：Statement 拼接 ----
        System.out.println("  ✗ 不安全写法（Statement 字符串拼接）");
        for (String input : new String[]{normal, attack1, attack2}) {
            String sql = "SELECT id, card_no, name FROM reader WHERE card_no = '" + input + "'";
            System.out.println("    输入：" + input);
            System.out.println("    SQL ：" + sql);

            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery(sql)) {
                List<String> names = new ArrayList<>();
                while (rs.next()) names.add(rs.getString("name"));
                System.out.println("    结果：" + (names.isEmpty() ? "0 行" :
                        names.size() + " 行 → " + String.join(", ", names)) +
                        (names.size() > 1 ? "   ⚠️ 被注入了！" : ""));
            }
            System.out.println();
        }

        // ---- ✓ 安全：PreparedStatement ----
        System.out.println("  ✓ 安全写法（PreparedStatement 预编译）");
        String safeSql = "SELECT id, card_no, name FROM reader WHERE card_no = ?";
        for (String input : new String[]{normal, attack1, attack2}) {
            System.out.println("    输入：" + input);
            System.out.println("    SQL ：" + safeSql);

            try (PreparedStatement ps = conn.prepareStatement(safeSql)) {
                ps.setString(1, input);
                try (ResultSet rs = ps.executeQuery()) {
                    List<String> names = new ArrayList<>();
                    while (rs.next()) names.add(rs.getString("name"));
                    System.out.println("    结果：" + (names.isEmpty() ? "0 行（注入无效 ✓）" :
                            names.size() + " 行 → " + String.join(", ", names)));
                }
            }
            System.out.println();
        }

        System.out.println("  结论：预编译让 SQL 结构在参数到来前就已固定，");
        System.out.println("        用户输入永远只是「数据」，无法改变语法结构。");
        System.out.println();
    }

    /* ══════════ 实验 3：批处理性能 ══════════ */
    static void step3Batch(Connection conn) throws SQLException {
        System.out.println("【实验 3】批处理 vs 逐条插入");
        System.out.println("───────────────────────────────────────────────────────");

        String sql = "INSERT INTO sql_lab_probe (v) VALUES (?)";

        // 确保临时表存在（用 bookhub 外的表避免污染业务数据）
        try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE IF NOT EXISTS sql_lab_probe (id BIGINT AUTO_INCREMENT PRIMARY KEY, v VARCHAR(20)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            st.execute("TRUNCATE TABLE sql_lab_probe");
        }

        final int N = 500;

        // 逐条插入
        long t1 = System.nanoTime();
        conn.setAutoCommit(false);
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            for (int i = 0; i < N; i++) {
                ps.setString(1, "v" + i);
                ps.executeUpdate();
            }
        }
        conn.commit();
        long ms1 = (System.nanoTime() - t1) / 1_000_000;

        // 批处理
        long t2 = System.nanoTime();
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            for (int i = 0; i < N; i++) {
                ps.setString(1, "b" + i);
                ps.addBatch();
                if (i % 100 == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        conn.commit();
        long ms2 = (System.nanoTime() - t2) / 1_000_000;

        conn.setAutoCommit(true);

        System.out.printf("  %d 条逐条插入：%d ms%n", N, ms1);
        System.out.printf("  %d 条批处理  ：%d ms%n", N, ms2);
        if (ms2 > 0) {
            System.out.printf("  → 批处理快 %.1f 倍%n", (double) ms1 / ms2);
        }
        System.out.println();
        System.out.println("  注意：这里的差距取决于网络延迟。");
        System.out.println("       本地回环差距小；跨网络时批处理优势会非常明显（可能 10 倍以上）。");
        System.out.println("       另外 MySQL 驱动需要 rewriteBatchedStatements=true 才能真批处理。");
        System.out.println();

        // 清理
        try (Statement st = conn.createStatement()) {
            st.execute("DROP TABLE IF EXISTS sql_lab_probe");
        }
    }

    /* ══════════ 实验 4：事务回滚 ══════════ */
    static void step4Transaction(Connection conn) throws SQLException {
        System.out.println("【实验 4】事务：扣库存 + 插记录，故意失败验证回滚");
        System.out.println("───────────────────────────────────────────────────────");

        long bookId = 3;      // 《Spring 实战》，初始 stock = 4
        long readerId = 1;

        int stockBefore = getStock(conn, bookId);
        int borrowBefore = countBorrow(conn, bookId);
        System.out.println("  事务前：stock = " + stockBefore + "，借阅记录 = " + borrowBefore);

        conn.setAutoCommit(false);
        try {
            // ① 扣库存
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE book SET stock = stock - 1 WHERE id = ? AND stock > 0")) {
                ps.setLong(1, bookId);
                int rows = ps.executeUpdate();
                System.out.println("  ① 扣库存：影响行数 = " + rows);
                if (rows == 0) throw new IllegalStateException("库存不足");
            }

            System.out.println("     事务内 stock = " + getStock(conn, bookId) + "（尚未提交）");

            // ② 故意抛异常，模拟"第二步失败"
            throw new SQLException("模拟业务失败：故意抛异常");

            // ③ 下面这行不会执行
            // borrowMapper.insert(...)

        } catch (Exception e) {
            System.out.println("  ② 捕获异常：" + e.getMessage());
            conn.rollback();
            System.out.println("  → 已回滚");
        } finally {
            conn.setAutoCommit(true);
        }

        int stockAfter = getStock(conn, bookId);
        int borrowAfter = countBorrow(conn, bookId);
        System.out.println("  事务后：stock = " + stockAfter + "，借阅记录 = " + borrowAfter);

        if (stockBefore == stockAfter) {
            System.out.println("  ✓ 库存已回滚（未被扣减）—— 事务生效");
        } else {
            System.out.println("  ✗ 库存未回滚！检查是否忘了 rollback() 或异常被吞");
        }
        System.out.println();
    }

    static int getStock(Connection conn, long bookId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT stock FROM book WHERE id = ?")) {
            ps.setLong(1, bookId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : -1;
            }
        }
    }

    static int countBorrow(Connection conn, long bookId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT COUNT(*) FROM borrow WHERE book_id = ?")) {
            ps.setLong(1, bookId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : -1;
            }
        }
    }
}
