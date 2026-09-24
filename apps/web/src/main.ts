import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import ru from 'element-plus/es/locale/lang/ru';
import 'element-plus/dist/index.css';
import App from './App.vue';
import { router } from './router';
import './styles.css';

const app = createApp(App);

const pinia = createPinia();
setActivePinia(pinia);
app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: ru });

app.config.errorHandler = (err, _instance, info) => {
  console.error('[vue]', info, err);
};

app.mount('#app');
