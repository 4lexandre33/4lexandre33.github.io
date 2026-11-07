/* GeoMannequin — paletas de cor da tela e da exportação, estilos do manequim */

const PAL_SCREEN={cobalt:"var(--g-blue)",coral:"var(--g-red)",ink:"var(--m-ink)",fill:"var(--fill)",shade1:"var(--shade1)",shade2:"var(--shade2)",shade3:"var(--shade3)"};
const STYLES={
  creme:{cobalt:"#8DB0E2",coral:"#E29A9F",ink:"#3E434D",fill:"#F6F4EA",shade1:"#E4E4EB",shade2:"#CBCCD9",shade3:"#A9ABBB"},
  azul:{cobalt:"#7FA8DC",coral:"#D98C96",ink:"#2F3A4C",fill:"#EEF2F8",shade1:"#DCE3EE",shade2:"#C2CCDB",shade3:"#98A4B8"},
  bege:{cobalt:"#7FAAD8",coral:"#E39A6C",ink:"#3A332E",fill:"#E9DFD3",shade1:"#DACDBF",shade2:"#C5B6A6",shade3:"#A08F80"},
  gelo:{cobalt:"#6E8FC9",coral:"#D0656B",ink:"#272C38",fill:"#F4F7FC",shade1:"#DEE4EE",shade2:"#BAC3D1",shade3:"#959FB2"},
  pessego:{cobalt:"#62B5C2",coral:"#D9686B",ink:"#3D3D47",fill:"#FCEEE7",shade1:"#F2DACE",shade2:"#E3C3B4",shade3:"#C49E8E"},
  lapis:{cobalt:"#8FA9D6",coral:"#D99098",ink:"#47484D",fill:"#FDFDFC",shade1:"#EDEDEE",shade2:"#DCDCDF",shade3:"#B3B4B9"},
  cinza:{cobalt:"#86AED6",coral:"#DE8E96",ink:"#33363C",fill:"#F3F3F3",shade1:"#E2E2E5",shade2:"#CACACF",shade3:"#A2A3AA"}
};
let styleName="creme";
let PAL_EXPORT=STYLES.creme;

/* alteração de variáveis deste módulo por outros módulos */
export function setStyleName(v){return styleName=v}
export function setPAL_EXPORT(v){return PAL_EXPORT=v}

export { PAL_SCREEN, STYLES, styleName, PAL_EXPORT };
