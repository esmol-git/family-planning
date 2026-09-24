<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, EditPen, Hide, Plus } from '@element-plus/icons-vue';
import { useFamilyStore, type Category } from '../stores/family';
import { ApiError } from '../api/client';
import { PREDEFINE_COLORS } from '../constants/colors';

const store = useFamilyStore();
const dialogVisible = ref(false);
const editing = ref<Category | null>(null);
const saving = ref(false);
const form = reactive({ name: '', color: '#0D9488' });

function openCreate() {
  editing.value = null;
  form.name = '';
  form.color = '#0D9488';
  dialogVisible.value = true;
}

function openEdit(category: Category) {
  editing.value = category;
  form.name = category.name;
  form.color = category.color;
  dialogVisible.value = true;
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('Укажите название');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await store.updateCategory(editing.value.id, {
        name: form.name.trim(),
        color: form.color,
      });
      ElMessage.success('Категория обновлена');
    } else {
      await store.createCategory({ name: form.name.trim(), color: form.color });
      ElMessage.success('Категория создана');
    }
    dialogVisible.value = false;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось сохранить');
  } finally {
    saving.value = false;
  }
}

async function deactivate(category: Category) {
  try {
    await ElMessageBox.confirm(
      `Скрыть категорию «${category.name}»? Она перестанет появляться в форме события.`,
      'Скрыть категорию',
      { type: 'warning' },
    );
    await store.updateCategory(category.id, { active: false });
    await store.loadCategories();
    ElMessage.success('Категория скрыта');
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message);
  }
}

async function remove(category: Category) {
  try {
    await ElMessageBox.confirm(
      `Удалить категорию «${category.name}»? Можно только если ни одно событие на неё не ссылается.`,
      'Удаление',
      { type: 'warning' },
    );
    await store.deleteCategory(category.id);
    ElMessage.success('Категория удалена');
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message);
  }
}
</script>

<template>
  <div class="categories-manager">
    <div class="categories-manager__toolbar">
      <p class="categories-manager__hint">Цвет помогает быстро различать события в календаре</p>
      <el-button type="primary" :icon="Plus" @click="openCreate">Добавить</el-button>
    </div>

    <el-empty
      v-if="!store.categories.length"
      description="Пока нет категорий"
      :image-size="72"
    />

    <div v-else class="category-list">
      <div v-for="row in store.categories" :key="row.id" class="category-card">
        <div class="category-card__main">
          <span class="category-card__swatch" :style="{ background: row.color }" />
          <span class="category-card__name">{{ row.name }}</span>
        </div>
        <el-space :size="4" class="category-card__actions">
          <el-tooltip content="Изменить" placement="top">
            <el-button :icon="EditPen" circle @click="openEdit(row)" />
          </el-tooltip>
          <el-tooltip content="Скрыть" placement="top">
            <el-button :icon="Hide" circle @click="deactivate(row)" />
          </el-tooltip>
          <el-tooltip content="Удалить" placement="top">
            <el-button :icon="Delete" circle type="danger" plain @click="remove(row)" />
          </el-tooltip>
        </el-space>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? 'Изменить категорию' : 'Новая категория'"
      width="440px"
      align-center
      append-to-body
      :modal="false"
      destroy-on-close
      class="airy-dialog nested-dialog"
    >
      <el-form label-position="top" size="large" @submit.prevent="save">
        <el-form-item label="Название" required>
          <el-input v-model="form.name" placeholder="Например, Музыка" clearable />
        </el-form-item>
        <el-form-item label="Цвет">
          <div class="color-row">
          <el-color-picker
            v-model="form.color"
            size="large"
            color-format="hex"
            :clearable="false"
            :predefine="PREDEFINE_COLORS"
          />
            <span class="color-row__preview" :style="{ background: form.color }" />
            <span class="muted">{{ form.color }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-space>
          <el-button size="large" @click="dialogVisible = false">Отмена</el-button>
          <el-button type="primary" size="large" :loading="saving" @click="save">
            Сохранить
          </el-button>
        </el-space>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.categories-manager__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.categories-manager__hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
  max-width: 22rem;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: min(58vh, 520px);
  overflow: auto;
  padding: 0.15rem 0.25rem 0.35rem 0.1rem;
}

.category-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1.1rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid rgba(31, 28, 26, 0.06);
  box-shadow:
    0 1px 2px rgba(31, 28, 26, 0.04),
    0 8px 24px rgba(31, 28, 26, 0.06);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}

.category-card:hover {
  box-shadow:
    0 2px 4px rgba(31, 28, 26, 0.05),
    0 14px 32px rgba(31, 28, 26, 0.1);
  transform: translateY(-1px);
}

.category-card__main {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.category-card__swatch {
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 999px;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35), 0 2px 8px rgba(31, 28, 26, 0.18);
}

.category-card__name {
  font-weight: 600;
  font-size: 0.98rem;
  letter-spacing: -0.01em;
}

.category-card__actions :deep(.el-button.is-circle) {
  width: 36px;
  height: 36px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.color-row__preview {
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(31, 28, 26, 0.12);
}
</style>
