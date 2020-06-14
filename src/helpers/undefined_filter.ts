export const undefined_filter = (data: any = {}) => {
    let rs = {}
    for (const key in data){
        data[key] !== undefined && (rs[key] = data[key])
    }
    return rs
}