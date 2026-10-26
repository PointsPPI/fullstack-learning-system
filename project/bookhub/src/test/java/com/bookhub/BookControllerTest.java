package com.bookhub;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.bookhub.common.R;
import com.bookhub.dto.BookCreateDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Controller 层测试 —— 不启动真实 Tomcat，用 MockMvc 直接打 DispatcherServlet。
 *
 * <pre>
 * 这类测试的价值在于验证"接口契约"：
 *   · 路径对不对（404 / 405）
 *   · 状态码对不对（200 / 201 / 204 / 400）
 *   · 响应结构对不对（code / message / data 三层）
 *   · 参数校验是否生效（400 + 字段级错误）
 *
 * 它不验证：
 *   · 真实的网络、CORS、序列化编码（那要靠 curl 或浏览器）
 *   · SQL 是否正确（那是 Service 测试的职责）
 * </pre>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class BookControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;

    @Test
    @DisplayName("GET /api/books → 200 + 统一响应 + 分页结构")
    void list() throws Exception {
        mvc.perform(get("/api/books").param("page", "1").param("size", "3"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.message").value("ok"))
           .andExpect(jsonPath("$.data.list").isArray())
           .andExpect(jsonPath("$.data.list.length()").value(3))
           .andExpect(jsonPath("$.data.total").value(12))
           .andExpect(jsonPath("$.data.pages").value(4))
           .andExpect(jsonPath("$.data.hasNext").value(true))
           .andExpect(jsonPath("$.timestamp").isNumber());
    }

    @Test
    @DisplayName("GET /api/books/{id} → 200 + 详情含计算字段")
    void detail() throws Exception {
        mvc.perform(get("/api/books/1"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.data.title").value("深入理解计算机系统"))
           .andExpect(jsonPath("$.data.categoryName").value("计算机"))
           .andExpect(jsonPath("$.data.statusText").value("上架"))
           .andExpect(jsonPath("$.data.available").value(true));
    }

    @Test
    @DisplayName("GET /api/books/99999 → HTTP 200 但业务码 20001")
    void detail_notFound() throws Exception {
        mvc.perform(get("/api/books/99999"))
           .andExpect(status().isOk())                  // 业务错误不改 HTTP 状态
           .andExpect(jsonPath("$.code").value(20001))
           .andExpect(jsonPath("$.message").value("图书不存在"));
    }

    @Test
    @DisplayName("POST /api/books → 201 + 返回新 id")
    void create() throws Exception {
        var dto = new BookCreateDTO("契约测试书", "作者", null, 1L,
                new BigDecimal("12.34"), 3, 1, null);

        mvc.perform(post("/api/books")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(dto)))
           .andExpect(status().isCreated())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.data").isNumber());
    }

    @Test
    @DisplayName("POST /api/books 参数非法 → 400 + 字段级错误详情")
    void create_invalid() throws Exception {
        var dto = new BookCreateDTO("", "作者", null, 1L,
                new BigDecimal("-1"), 1, 1, null);

        mvc.perform(post("/api/books")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(om.writeValueAsString(dto)))
           .andExpect(status().isBadRequest())
           .andExpect(jsonPath("$.code").value(10001))
           .andExpect(jsonPath("$.data.title").value("书名不能为空"))
           .andExpect(jsonPath("$.data.price").value("价格不能为负"));
    }

    @Test
    @DisplayName("POST /api/books 请求体不是合法 JSON → 400 且不泄露内部信息")
    void create_badJson() throws Exception {
        mvc.perform(post("/api/books")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{bad json"))
           .andExpect(status().isBadRequest())
           .andExpect(jsonPath("$.code").value(10001))
           // 关键：响应里不能出现类名/字段路径
           .andExpect(jsonPath("$.message").value(
                   org.hamcrest.Matchers.containsString("请求体格式错误")));
    }

    @Test
    @DisplayName("DELETE /api/books/{id} → 204 无响应体")
    void deleteShouldReturn204() throws Exception {
        // 先建一本没有借阅记录的书
        var dto = new BookCreateDTO("待删", "作者", null, 1L,
                new BigDecimal("1.00"), 1, 1, null);
        String body = mvc.perform(post("/api/books")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(om.writeValueAsString(dto)))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) om.readValue(body, R.class).data()).longValue();

        mvc.perform(MockMvcRequestBuilders.delete("/api/books/" + id))
           .andExpect(status().isNoContent())
           .andExpect(content().string(""));
    }

    @Test
    @DisplayName("PATCH /api/books → 405（本项目未提供 PATCH）")
    void methodNotAllowed() throws Exception {
        mvc.perform(patch("/api/books/1")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{}"))
           .andExpect(status().isMethodNotAllowed());
    }

    @Test
    @DisplayName("借书：库存不足 → 业务码 20002")
    void borrow_noStock() throws Exception {
        // 书 4 的 stock = 0
        mvc.perform(post("/api/books/4/borrow")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"readerId\":1}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(20002))
           .andExpect(jsonPath("$.message").value("该书暂无可借库存"));
    }

    @Test
    @DisplayName("借书：成功 → 返回应还日与剩余天数")
    void borrow_ok() throws Exception {
        mvc.perform(post("/api/books/1/borrow")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"readerId\":2}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.data.dueDate").isString())
           .andExpect(jsonPath("$.data.remainDays").value(30))
           .andExpect(jsonPath("$.data.overdue").value(false));
    }

    @Test
    @DisplayName("CORS 预检：OPTIONS 请求应返回允许头")
    void corsPreflight() throws Exception {
        mvc.perform(options("/api/books")
                    .header("Origin", "http://localhost:5173")
                    .header("Access-Control-Request-Method", "POST")
                    .header("Access-Control-Request-Headers", "Content-Type"))
           .andExpect(status().isOk())
           .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
           .andExpect(header().exists("Access-Control-Allow-Methods"));
    }
}
