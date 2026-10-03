import Dexie from "dexie";
import {useUserStore} from "@/store/user.js"
import { watch, shallowRef } from "vue";

const userStore = useUserStore();
const db = shallowRef(null)

function createDB(email) {
    db.value?.close()
    if (!email) {
        db.value = null
        return
    }
    const next = new Dexie(email);
    next.version(1).stores({
        draft: '++draftId,createTime'
    })

    next.version(1).stores({
        att: 'draftId'
    })
    db.value = next
}

watch(() => userStore.user.email, createDB, { immediate: true, flush: 'sync' })

export default db;
