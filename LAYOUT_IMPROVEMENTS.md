# Đề xuất cải tiến bố cục 2 cột (Layout Improvements)

Dưới đây là chi tiết các đề xuất tối ưu hóa bố cục giao diện và hướng dẫn code cụ thể cho từng file để thực hiện hàng loạt.

---

## 🛠️ Nhiệm vụ 1: Cấu hình bảng điều khiển Thu gọn / Mở rộng (Collapsible Panel)

**Mục tiêu:** Cho phép thu gọn cột control bên trái (320px) để vùng kết quả (bảng biểu đồ, dữ liệu lớn) được kéo giãn hết chiều rộng màn hình.

### 📄 File cần sửa: [ToolPageLayout.svelte](file:///c:/DATA/viemid/herorank/app/src/lib/components/tools/ToolPageLayout.svelte)

**Ý tưởng code thay đổi:**
1. Thêm trạng thái `collapsed`:
   ```typescript
   let collapsed = $state(false);
   ```
2. Cập nhật Grid container để thay đổi cột động dựa trên `collapsed`:
   ```svelte
   <div class="grid grid-cols-1 {collapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[320px_minmax(0,1fr)]'} gap-5 lg:gap-8 items-start mt-4 lg:mt-6">
   ```
3. Ẩn/Hiện phần `<aside>` mượt mà:
   ```svelte
   {#if !collapsed}
     <aside class="min-w-0 lg:sticky lg:top-6 transition-all">
       <div class="card p-4 sm:p-5 bg-white border border-border rounded-xl shadow-sm flex flex-col min-w-0">
         {@render controls!()}
         ...
       </div>
     </aside>
   {/if}
   ```
4. Thêm nút Toggle Collapse ở đầu cột hiển thị kết quả (cột bên phải):
   ```svelte
   <div class="min-w-0">
     <!-- Nút Toggle -->
     <button
       type="button"
       onclick={() => collapsed = !collapsed}
       class="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-border text-xs text-text-secondary hover:text-teal font-semibold shadow-sm transition-all"
     >
       {#if collapsed}
         <span>➡️ Hiện bảng điều khiển</span>
       {:else}
         <span>⬅️ Ẩn bảng điều khiển (Mở rộng kết quả)</span>
       {/if}
     </button>

     {@render children()}
   </div>
   ```

---

## 🛠️ Nhiệm vụ 2: Chuyển đổi công cụ Editor phức tạp sang 1 cột

**Mục tiêu:** Tránh nhồi nhét biểu mẫu chỉnh sửa sản phẩm phức tạp vào thanh điều khiển 320px hẹp.

### 📄 File 1: [listing-editor/+page.svelte](file:///c:/DATA/viemid/herorank/app/src/routes/\(dashboard\)/tools/etsy/listing-editor/+page.svelte)
### 📄 File 2: [listing-builder/+page.svelte](file:///c:/DATA/viemid/herorank/app/src/routes/\(dashboard\)/tools/etsy/listing-builder/+page.svelte)

**Ý tưởng thay đổi:**
* Đưa form tải sản phẩm lên phía trên hoặc vào phần trung tâm trang.
* Không truyền snippet `controls` cho `<ToolPageLayout>` nữa. Khi đó, `ToolPageLayout` sẽ tự động chuyển sang chế độ `twoPane = false` (bố cục 1 cột trung tâm rộng rãi).
* Kết quả chấm điểm SEO và Tips hướng dẫn sẽ hiển thị thành một cột phụ nằm ở bên cạnh hoặc tích hợp gọn gàng dạng accordion trên đầu giao diện chỉnh sửa sản phẩm.

---

## 🛠️ Nhiệm vụ 3: Tối ưu hóa độ rộng của các biểu mẫu đơn giản

**Mục tiêu:** Tránh khoảng trắng thừa ở thanh bên trái khi biểu mẫu chỉ có 1 ô nhập liệu duy nhất.

### 📄 File cần sửa: [ToolPageLayout.svelte](file:///c:/DATA/viemid/herorank/app/src/lib/components/tools/ToolPageLayout.svelte)

**Ý tưởng code thay đổi:**
* Cho phép truyền class độ rộng tùy chọn từ các trang con thông qua prop `controlWidthClass`:
  ```typescript
  let { title, description, icon, credits, controlWidthClass = "lg:grid-cols-[320px_minmax(0,1fr)]", ... } = $props();
  ```
* Trên các trang như `rank-check` (Chỉ nhập 1 URL/Keyword) hay `buyer-check`, truyền `controlWidthClass="lg:grid-cols-[260px_minmax(0,1fr)]"` để thu hẹp cột trái, tăng diện tích thông thoáng cho cột phải.

---

## 🛠️ Nhiệm vụ 4: Floating Sidebar Hướng dẫn (SEO Tips/Rules Drawer) cho Listing Editor

**Mục tiêu:** Trong giao diện 1 cột của Listing Editor / Builder, các thẻ hướng dẫn chấm điểm SEO và Tips không được làm phiền hoặc chiếm diện tích form nhập liệu chính.

**Giải pháp đề xuất:**
* Thiết kế một **floating right panel (Drawer)** thu mình ở mép phải màn hình dưới dạng một nút/tab "SEO Score & Tips".
* Khi nhấp vào, Drawer sẽ trượt ra (slide in) từ bên phải, đè lên một phần kết quả phụ, hiển thị danh sách checklist chấm điểm SEO chi tiết mà không làm thay đổi bố cục form soạn thảo chính ở giữa.
* Cách tiếp cận này giúp tối ưu hóa diện tích tập trung viết tiêu đề và mô tả sản phẩm (Focus Mode).

---

## 🛠️ Nhiệm vụ 5: Cải tiến Lưới hiển thị Mockup (Responsive Grids) trong AI Image Studio

**Mục tiêu:** Các ảnh mockup sản phẩm tạo ra cần được hiển thị ở các kích thước tối ưu nhất tùy theo tỷ lệ khung hình đã chọn (1:1, 4:3, 9:16) mà không bị méo hoặc thừa khoảng trống đen (letterboxing).

**Giải pháp đề xuất:**
* Sử dụng CSS grid động cho vùng kết quả ảnh:
  ```css
  .mockup-grid-1-1 { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .mockup-grid-9-16 { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  ```
* Thêm hiệu ứng phóng to ảnh thu nhỏ (Lightbox modal) khi click vào từng ảnh để kiểm tra chi tiết độ phân giải của mockup trước khi lưu hoặc tải về máy.
* Thêm hover-actions toolbar trên từng ảnh (Download, Delete, Copy Prompt) xuất hiện nhẹ nhàng với hiệu ứng fade-in.
