import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {

    state: () => ({
        asideShow: window.innerWidth > 1024,

        accountShow: false,

        backgroundLoading: true,

        changeNotice: 0,

        writerRef: null,

        changePreview: 0,

        previewData: {},

        key: 0,


        // 保留 index.html 首屏主题
        dark:
            window.__NOVA_INITIAL_THEME__?.dark ??
            false,


        themeMode:
            window.__NOVA_INITIAL_THEME__?.mode ??
            'system',


        asideCount: {
            email:0,
            send:0,
            sysEmail:0
        }
    }),


    actions:{


        showNotice(){
            this.changeNotice++
        },


        previewNotice(data){
            this.previewData=data
            this.changePreview++
        },


        applyTheme(){

            let mode=this.themeMode


            if(!['light','dark','system'].includes(mode)){

                mode =
                    window.__NOVA_INITIAL_THEME__?.mode
                    ||
                    (this.dark ? 'dark':'light')


                this.themeMode=mode
            }



            let effectiveDark=false


            if(mode==='dark'){
                effectiveDark=true
            }
            else if(mode==='system'){

                effectiveDark =
                    window.matchMedia(
                        '(prefers-color-scheme: dark)'
                    ).matches

            }



            this.dark=effectiveDark



            const root=document.documentElement


            root.classList.toggle(
                'dark',
                effectiveDark
            )


            root.style.colorScheme =
                effectiveDark
                    ? 'dark'
                    :'light'



            const metaTag =
                document.getElementById(
                    'theme-color-meta'
                )
                ||
                document.querySelector(
                    'meta[name="theme-color"]'
                )


            metaTag?.setAttribute(
                'content',
                effectiveDark
                    ? '#141414'
                    :'#FFFFFF'
            )


            const statusBarMeta =
                document.getElementById(
                    'apple-status-bar-meta'
                )


            statusBarMeta?.setAttribute(
                'content',
                effectiveDark
                    ? 'black'
                    :'default'
            )

        },



        setThemeMode(mode){

            if(![
                'light',
                'dark',
                'system'
            ].includes(mode)) return


            this.themeMode=mode

            this.applyTheme()

        }

    },


    persist:{
        pick:[
            'accountShow',
            'dark',
            'themeMode'
        ]
    }

})