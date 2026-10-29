import {Component,type ReactNode,type ErrorInfo} from 'react';
import {reloadChunkOnce,reportRouteFailure} from './route-failure';
export class RouteError extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error,_info:ErrorInfo){
    reportRouteFailure(error);
    try{reloadChunkOnce(error,window.sessionStorage,()=>window.location.reload());}catch{/* Storage may be unavailable. */}
  }
  render(){return this.state.failed?<section className="mig-container mig-panel mig-load-error" role="alert"><h1>Chưa tải được nội dung</h1><p>Kết nối có thể đã gián đoạn hoặc phiên bản trang vừa thay đổi. Bản sổ tay đã lưu trên trình duyệt không bị xóa.</p><button type="button" className="mig-button outline" onClick={()=>location.reload()}>Thử tải lại trang</button></section>:this.props.children;}
}
